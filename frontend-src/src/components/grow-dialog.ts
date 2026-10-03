import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { sharedStyles } from "../styles";
import { BOX_SIZES, Cabinet, getRackSlots } from "../models";
import { growKind, defaultBoxSize, MAX_RACK_DEPTH, zoneLabel } from "../utils/grow";
import { storageRowFor, zoneCapacity } from "../utils/location";

// Asks to make room in a full container, then does it. Replaces the old
// "it's full, go and raise its capacity in Manage Racks" dead end. Always asks:
// nothing here grows on its own.
//
// What "bigger" means depends on the container, see utils/grow.ts.
@customElement("wine-grow-dialog")
export class WineGrowDialog extends LitElement {
  @property({ attribute: false }) hass: any;
  @property({ attribute: false }) cabinet: Cabinet | null = null;
  // "storage-N" for a bin or box row, "" for a grid slot.
  @property({ type: String }) zone = "";
  // How many places are missing: the bottles being placed minus what is free.
  @property({ type: Number }) needed = 1;

  @state() private _add = 1;
  @state() private _boxSize = 12;
  @state() private _busy = false;
  @state() private _error = "";

  static styles = [
    sharedStyles,
    css`
      .grow-overlay {
        z-index: 1000;
      }
      .grow-box {
        max-width: 360px;
        padding: 22px;
        text-align: center;
      }
      .grow-box h3 {
        margin: 0 0 6px;
        font-size: 1.05em;
        color: var(--wc-text);
      }
      .grow-box p {
        margin: 0 0 14px;
        font-size: 0.88em;
        color: var(--wc-text-secondary);
      }
      .grow-stepper {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        margin-bottom: 14px;
      }
      .grow-stepper button {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 1px solid var(--wc-border);
        background: transparent;
        color: var(--wc-text);
        font-size: 1.1em;
        cursor: pointer;
      }
      .grow-stepper button:disabled {
        opacity: 0.35;
        cursor: default;
      }
      .grow-stepper .val {
        min-width: 48px;
        font-size: 1.3em;
        font-weight: 600;
        color: var(--wc-text);
      }
      .grow-sizes {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
        margin-bottom: 14px;
      }
      .grow-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .grow-error {
        color: #ef5350;
        font-size: 0.85em;
        margin-bottom: 10px;
      }
    `,
  ];

  willUpdate(changed: Map<string, unknown>) {
    if (changed.has("needed") || changed.has("zone") || changed.has("cabinet")) {
      const needed = Math.max(1, Math.round(this.needed) || 1);
      this._add = needed;
      this._boxSize = defaultBoxSize(needed);
      this._error = "";
    }
  }

  private _cancel() {
    this.dispatchEvent(new CustomEvent("cancel", { bubbles: true, composed: true }));
  }

  private async _confirm() {
    if (!this.cabinet) return;
    const kind = growKind(this.cabinet, this.zone);
    this._busy = true;
    this._error = "";
    try {
      const result = await this.hass.callWS({
        type: "wine_cellar/grow_container",
        cabinet_id: this.cabinet.id,
        zone: this.zone,
        add: this._add,
        ...(kind === "box" ? { box_size: this._boxSize } : {}),
      });
      if (result?.error) {
        this._error = result.error;
      } else {
        this.dispatchEvent(
          new CustomEvent("grown", { detail: { cabinet: result?.cabinet }, bubbles: true, composed: true })
        );
      }
    } catch {
      this._error = "Could not make room. Try again.";
    }
    this._busy = false;
  }

  private _body(kind: NonNullable<ReturnType<typeof growKind>>) {
    const cab = this.cabinet!;
    if (kind === "depth") {
      const depth = cab.depth || 1;
      const room = MAX_RACK_DEPTH - depth;
      if (room <= 0) {
        return {
          text: `${cab.name} is already ${MAX_RACK_DEPTH} deep, the maximum. Pick another slot, or free one.`,
          canConfirm: false,
          controls: nothing,
          confirmLabel: "",
        };
      }
      const add = Math.min(this._add, room);
      const slots = getRackSlots(cab).length;
      return {
        text: `Every slot of ${cab.name} holds ${depth} bottle${depth > 1 ? "s" : ""}, one behind the other. Make the whole rack ${depth + add} deep? That is ${slots * add} more places in total.`,
        canConfirm: true,
        confirmLabel: `Make it ${depth + add} deep`,
        controls: html`
          <div class="grow-stepper">
            <button ?disabled=${this._add <= 1} @click=${() => (this._add = this._add - 1)}>−</button>
            <span class="val">+${add}</span>
            <button ?disabled=${this._add >= room} @click=${() => (this._add = this._add + 1)}>+</button>
          </div>
        `,
      };
    }

    const sr = storageRowFor(cab, this.zone);
    const name = zoneLabel(sr);
    const capacity = sr ? zoneCapacity(sr) : 0;
    if (kind === "box") {
      return {
        text: `Add a box to ${name} (${capacity} → ${capacity + this._boxSize} places). Which size?`,
        canConfirm: true,
        confirmLabel: `Add a box of ${this._boxSize}`,
        controls: html`
          <div class="grow-sizes">
            ${BOX_SIZES.map(
              (size) => html`
                <button
                  class="btn ${this._boxSize === size ? "btn-primary" : "btn-outline"}"
                  style="padding:6px 12px"
                  @click=${() => (this._boxSize = size)}
                >${size}</button>
              `
            )}
          </div>
        `,
      };
    }
    return {
      text: `Add places to ${name} (${capacity} → ${capacity + this._add}).`,
      canConfirm: true,
      confirmLabel: `Add ${this._add} place${this._add > 1 ? "s" : ""}`,
      controls: html`
        <div class="grow-stepper">
          <button ?disabled=${this._add <= 1} @click=${() => (this._add = this._add - 1)}>−</button>
          <span class="val">+${this._add}</span>
          <button @click=${() => (this._add = this._add + 1)}>+</button>
        </div>
      `,
    };
  }

  render() {
    if (!this.cabinet) return nothing;
    const kind = growKind(this.cabinet, this.zone);
    if (!kind) return nothing;
    const body = this._body(kind);
    const sr = storageRowFor(this.cabinet, this.zone);
    const title = kind === "depth" ? "This slot is full" : `${zoneLabel(sr)} is full`;

    return html`
      <div class="dialog-overlay grow-overlay" @click=${this._cancel}>
        <div class="dialog grow-box" @click=${(e: Event) => e.stopPropagation()}>
          <h3>${title}</h3>
          <p>${body.text}</p>
          ${body.controls}
          ${this._error ? html`<div class="grow-error">${this._error}</div>` : nothing}
          <div class="grow-actions">
            ${body.canConfirm
              ? html`<button class="btn btn-primary" ?disabled=${this._busy} @click=${this._confirm}>
                  ${this._busy ? "Working…" : body.confirmLabel}
                </button>`
              : nothing}
            <button class="btn btn-outline" ?disabled=${this._busy} @click=${this._cancel}>Cancel</button>
          </div>
        </div>
      </div>
    `;
  }
}
