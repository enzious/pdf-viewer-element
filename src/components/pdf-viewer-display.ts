/**
 * Copyright 2019 Justin Fagnani <justin@fagnani.com>
 */
import {LitElement, html, css, PropertyValues, CSSResultGroup} from 'lit';
import {property, customElement, query} from 'lit/decorators.js';

// import { getDocument } from 'pdfjs-dist';
import * as pdfjsLib from 'pdfjs-dist';
globalThis.pdfjsLib = pdfjsLib;
// import { EventBus, PDFSinglePageViewer, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';
import type { PDFViewer as PDFViewerType } from 'pdfjs-dist/web/pdf_viewer';
const { EventBus, PDFSinglePageViewer, PDFViewer } = await import( "pdfjs-dist/web/pdf_viewer.mjs");
import {styles} from '../lib/styles.js';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  '../../node_modules/pdfjs-dist/build/pdf.worker.min.js';

const ptToPx: number = 96.0 / 72.0;

/**
 * A web component that displays PDFs
 *
 * @cssprop [--pdf-viewer-top-bar-height=48px]
 * @cssprop [--pdf-viewer-page-shadow=2px 2px 2px 1px rgba(0, 0, 0, 0.2)]
 * @cssprop [--pdf-viewer-background=gray]
 */
@customElement('pdf-viewer-display')
export class PDFViewerDisplayElement extends LitElement {
  static styles = [
    styles,
    css`
      :host {
        display: block;
        position: relative;
        height: 480px;
        --pdf-viewer-background: gray;
        --pdf-viewer-page-shadow: 2px 2px 2px 1px rgba(0, 0, 0, 0.2);
        background: --pdf-viewer-background;
      }
      #container {
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        right: 0;
        overflow: auto;
      }
      /*
      Styling .canvasWrapper because .page has a padding and the drop-shadow
      is offset from the page.
    */
      .canvasWrapper {
        box-shadow: var(--pdf-viewer-page-shadow);
      }
    `,
  ] as CSSResultGroup;

  @property({type: String, reflect: true})
  src?: string;

  /**
   * The current 1-based page number.
   */
  @property({type: Number, reflect: true})
  page: number = 1;

  /**
   * Total page count of the current document.
   */
  get pageCount() {
    return this._viewer?.pagesCount;
  }

  /**
   * Whether multiple pages should render. Single page rendering is much faster.
   */
  @property({
    attribute: 'multi-page',
    type: Boolean,
    reflect: true,
  })
  multiPage = false;

  @property({
    reflect: true,
  })
  scale: number | 'cover' | 'contain' = 'cover';

  private _currentScale?: number;

  @property({type: Number, reflect: true})
  zoom = 1;

  @property({attribute: 'document-title'})
  documentTitle?: string;

  // TODO: This is the border on div.page make by pdf.js. Where does it come
  // from, and can we read or set it?
  private _pageBorderWidth = 9;

  // TODO: This is the macOS border size, used to reserve space for scrollbars
  // and prevent an overflow on one axis from unneccessarily causing an overflow
  // on the other axis. There's got to be a better way.
  private _scrollBarSize = 16;

  @query('#viewer')
  private _viewerElement!: HTMLDivElement;

  private _viewer?: PDFViewerType;

  private _document?: any;

  private _resizeObserver: ResizeObserver = new ResizeObserver(() =>
    this._onResize()
  );

  private _eventBus = new EventBus();

  constructor() {
    super();
    this._resizeObserver.observe(this);
  }

  render() {
    return html`<div id="container"></div>`;
  }

  async updated(changedProperties: PropertyValues) {
    console.log('quack');
    let setScale = false;
    if (changedProperties.has('multiPage')) {
      setScale = true;
      const container = this.shadowRoot!.querySelector(
        '#container'
      ) as HTMLDivElement;
      // When multiPage changes we must make a new viewer element.
      container.innerHTML = '<div id="viewer" class="viewer"></div>';
      console.log('pdfviewer', PDFViewer);
      console.log('container', container);
      if (this.multiPage) {
        this._viewer = new PDFViewer({
          container,
          eventBus: this._eventBus,
          viewer: this._viewerElement,
          // linkService: linkService,
          // findController: findController,
        });
      } else {
        this._viewer = new PDFSinglePageViewer({
          container,
          eventBus: this._eventBus,
          // viewer: this._viewerElement,
          // linkService: linkService,
          // findController: findController,
        });
      }
      if (this._document) {
        console.log('test', this._viewer, this._document);
        this._viewer?.setDocument(this._document);
      }
      this.requestUpdate();
    }

    if (changedProperties.has('src')) {
      this._load();
    }

    if (changedProperties.has('page')) {
      this._viewer?.scrollPageIntoView({
        pageNumber: this.page,
      });
    }

    if (this._document !== undefined) {
      if (this._currentScale === undefined || changedProperties.has('scale')) {
        setScale = true;
        if (this.scale === 'cover' || this.scale === 'contain') {
          const page = await this._document.getPage(
            this._viewer?.currentPageNumber
          );
          const viewport = page.getViewport({
            scale: 1,
            rotation: 0,
          });
          const availableWidth =
            this.offsetWidth - this._pageBorderWidth * 2 - this._scrollBarSize;
          const availableHeight =
            this.offsetHeight - this._pageBorderWidth * 2 - this._scrollBarSize;
          const viewportWidthPx = viewport.width * ptToPx;
          const viewportHeightPx = viewport.height * ptToPx;
          const fitWidthScale = availableWidth / viewportWidthPx;
          const fitHeightScale = availableHeight / viewportHeightPx;
          if (this.scale === 'cover') {
            this._currentScale = Math.max(fitWidthScale, fitHeightScale);
          } else {
            this._currentScale = Math.min(fitWidthScale, fitHeightScale);
          }
        } else {
          this._currentScale = this.scale;
        }
      }
      if (setScale) {
        // TODO: if the viewer is new we have to wait for "pagesinit"?
        if (this._viewer) {
          this._viewer.currentScale = this._currentScale * this.zoom;
        }
      }
    }
  }

  private async _load() {
    try {
      const loadingTask = pdfjsLib.getDocument({
        url: this.src,
        // cMapUrl: CMAP_URL,
        // cMapPacked: CMAP_PACKED,
      });
      const document = await loadingTask.promise;
      if (this._document) {
        this._document.destroy();
      }
      this._document = document;
      // Document loaded, specifying document for the viewer and
      // the (optional) linkService.
      this._viewer?.setDocument(document);
      // linkService.setDocument(document, null);
      const metadata = await document.getMetadata();
      console.log({metadata});
      this.documentTitle = (metadata.info as any).Title;
      this.requestUpdate();
      this.dispatchEvent(new Event('load'));
    } catch (e) {
      console.log('e', e);
      this.dispatchEvent(
        new ErrorEvent('error', {
          error: e,
        })
      );
    }
  }

  _onResize() {
    console.log('_onResize');
    this.requestUpdate();
  }
}
