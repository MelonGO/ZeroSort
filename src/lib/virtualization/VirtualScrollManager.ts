import { debounce } from "lodash-es";

/**
 * Configuration options for the virtualized list layout.
 */
export interface LayoutOptions {
  /** The height of header elements in pixels. */
  headerHeight: number;
  /** The height of a single row or item in pixels. */
  rowHeight: number;
  /** The spacing between items in pixels. */
  gap: number;
}

/**
 * Abstract base class for managing virtualized scrolling logic.
 * Handles viewport calculations, scroll event tracking, and observer notification.
 * Designed to be extended by specific layout managers (e.g., {@link TimelineManager}).
 */
export class VirtualScrollManager {
  private _topSectionHeight = 0;
  private _version = 0;
  private _batchDepth = 0;
  private _batchDirty = false;
  bodySectionHeight = 0;
  bottomSectionHeight = 0;

  get topSectionHeight() {
    return this._topSectionHeight;
  }

  set topSectionHeight(value: number) {
    if (this._topSectionHeight !== value) {
      this._topSectionHeight = value;
      this.refreshLayout();
    }
  }

  protected _viewportHeight = 0;
  protected _viewportWidth = 0;
  protected _scrollTop = 0;
  protected _rowHeight = 150;
  protected _headerHeight = 48;
  protected _gap = 16;
  protected _scrolling = false;
  protected _suspendTransitions = false;

  private _resetScrolling = debounce(() => (this.scrolling = false), 1000);
  private _resetSuspendTransitions = debounce(
    () => (this.suspendTransitions = false),
    1000,
  );

  constructor() {
    this.setLayoutOptions();
  }

  /**
   * Gets the total calculated height of all sections combined (top, body, and bottom).
   * Used to set the total scrollable area height.
   *
   * @returns The total height in pixels.
   */
  get totalViewerHeight() {
    return (
      this.topSectionHeight + this.bodySectionHeight + this.bottomSectionHeight
    );
  }

  get version() {
    return this._version;
  }

  /**
   * Gets the current visible vertical window within the scrollable area.
   *
   * @returns An object containing the top and bottom pixel coordinates of the viewport.
   */
  get visibleWindow() {
    return {
      top: this._scrollTop,
      bottom: this._scrollTop + this.viewportHeight,
    };
  }

  get viewportHeight() {
    return this._viewportHeight;
  }

  set viewportHeight(value: number) {
    if (this._viewportHeight !== value) {
      this._viewportHeight = value;
      this.suspendTransitions = true;
      const layoutChanged = this.updateViewportGeometry(false);
      const intersectionsChanged = this.updateIntersections();
      if (layoutChanged || intersectionsChanged) {
        this.notifyListeners();
      }
    }
  }

  get viewportWidth() {
    return this._viewportWidth;
  }

  set viewportWidth(value: number) {
    const changed = value !== this._viewportWidth;
    if (changed) {
      this._viewportWidth = value;
      this.suspendTransitions = true;
      const layoutChanged = this.updateViewportGeometry(true);
      const intersectionsChanged = this.updateIntersections();
      if (layoutChanged || intersectionsChanged) {
        this.notifyListeners();
      }
    }
  }

  /**
   * Batched viewport update that sets both width and height in a single pass.
   * Avoids the double recalculation that happens when setting width and height separately.
   */
  setViewport(width: number, height: number) {
    const wChanged = width !== this._viewportWidth;
    const hChanged = height !== this._viewportHeight;
    if (!wChanged && !hChanged) return;
    this._viewportWidth = width;
    this._viewportHeight = height;
    this.suspendTransitions = true;
    const layoutChanged = this.updateViewportGeometry(wChanged);
    const intersectionsChanged = this.updateIntersections();
    if (layoutChanged || intersectionsChanged) {
      this.notifyListeners();
    }
  }

  get scrollTop() {
    return this._scrollTop;
  }

  set scrollTop(value: number) {
    if (this._scrollTop !== value) {
      this._scrollTop = value;
      if (this.updateIntersections()) {
        this.notifyListeners();
      }
    }
  }

  get rowHeight() {
    return this._rowHeight;
  }

  get headerHeight() {
    return this._headerHeight;
  }

  get gap() {
    return this._gap;
  }

  get scrolling() {
    return this._scrolling;
  }

  set scrolling(value: boolean) {
    this._scrolling = value;
    if (value) {
      this.suspendTransitions = true;
      this._resetScrolling();
    }
  }

  get suspendTransitions() {
    return this._suspendTransitions;
  }

  set suspendTransitions(value: boolean) {
    this._suspendTransitions = value;
    if (value) {
      this._resetSuspendTransitions();
    }
  }

  /**
   * Calculates the maximum possible vertical scroll position.
   *
   * @returns The maximum scroll top value in pixels.
   */
  get maxScroll() {
    return Math.max(0, this.totalViewerHeight - this.viewportHeight);
  }

  /**
   * Determines if the viewport has invalid dimensions (zero width or height).
   *
   * @returns True if the viewport is empty, false otherwise.
   */
  get hasEmptyViewport() {
    return this.viewportWidth === 0 || this.viewportHeight === 0;
  }

  /**
   * Abstract method to update which items are currently within or near the visible viewport.
   * Must be implemented by subclasses.
   */
  protected updateIntersections(): boolean {
    return false;
  }

  /**
   * Abstract method to recalculate item positions and container dimensions.
   * Must be implemented by subclasses.
   *
   * @param changedWidth - Boolean indicating if the viewport width was modified.
   */
  protected updateViewportGeometry(
    _changedWidth: boolean,
    _forceLayout = false,
  ): boolean {
    return false;
  }

  /**
   * Configures the layout dimensions for the virtualized list.
   * Triggers a layout refresh if any values change.
   *
   * @param options - Partial object containing headerHeight, rowHeight, and gap.
   */
  setLayoutOptions({
    headerHeight = 48,
    rowHeight = 150,
    gap = 16,
  }: Partial<LayoutOptions> = {}) {
    let changed = false;
    if (this._headerHeight !== headerHeight) {
      this._headerHeight = headerHeight;
      changed = true;
    }
    if (this._gap !== gap) {
      this._gap = gap;
      changed = true;
    }
    if (this._rowHeight !== rowHeight) {
      this._rowHeight = rowHeight;
      changed = true;
    }

    if (changed) {
      this.refreshLayout();
    }
  }

  private listeners: (() => void)[] = [];

  /**
   * Registers a listener callback to be executed when the layout or scroll position updates.
   *
   * @param listener - The callback function to register.
   */
  addListener(listener: () => void) {
    this.listeners.push(listener);
  }

  /**
   * Unregisters a previously added listener callback.
   *
   * @param listener - The callback function to remove.
   */
  removeListener(listener: () => void) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  /**
   * Notifies all registered listeners that an update has occurred.
   */
  protected notifyListeners() {
    this._version += 1;
    this.listeners.forEach((l) => l());
  }

  /**
   * Triggers a full recalculation of the layout geometry and item visibility.
   */
  refreshLayout() {
    if (this._batchDepth > 0) {
      this._batchDirty = true;
      return;
    }
    const layoutChanged = this.updateViewportGeometry(false, true);
    const intersectionsChanged = this.updateIntersections();
    if (layoutChanged || intersectionsChanged) {
      this.notifyListeners();
    }
  }

  /**
   * Batches multiple property changes into a single layout pass.
   */
  batchUpdate(fn: () => void) {
    this._batchDepth++;
    try {
      fn();
    } finally {
      this._batchDepth--;
      if (this._batchDepth === 0 && this._batchDirty) {
        this._batchDirty = false;
        this.refreshLayout();
      }
    }
  }

  /**
   * Cleans up all registered listeners and internal resources.
   * Should be called when the manager instance is no longer needed.
   */
  destroy(): void {
    this._resetScrolling.cancel();
    this._resetSuspendTransitions.cancel();
    this.listeners = [];
  }
}
