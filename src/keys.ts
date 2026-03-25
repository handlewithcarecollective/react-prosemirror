export class KeyInfo {
  constructor(
    public key: string | undefined,
    public type: "widget" | "node" | "hack",
    public parentKey: string | undefined,
    public offset: number,
    public index: number
  ) {}

  toString() {
    return `${this.type}-${this.key ?? `${this.parentKey}-${this.index}`}`;
  }

  eq(other: KeyInfo) {
    if (this.key === other.key) return true;
    return (
      this.type === other.type &&
      this.parentKey === other.parentKey &&
      this.offset === other.offset &&
      this.index === other.index
    );
  }
}
