/** Classic video-poker style paytable panel (blue glass, yellow LED text). */
export class Paytable {
  readonly el: HTMLElement;
  private rows: HTMLTableRowElement[] = [];

  constructor(
    parent: HTMLElement,
    title: string,
    rows: (string | number)[][],
    o: { cls?: string; head?: string[] } = {},
  ) {
    const el = document.createElement('div');
    el.className = `paytable ${o.cls ?? ''}`;
    const table = document.createElement('table');
    if (o.head) {
      const tr = document.createElement('tr');
      tr.className = 'pt-head';
      for (const h of o.head) {
        const th = document.createElement('th');
        th.textContent = h;
        tr.appendChild(th);
      }
      table.appendChild(tr);
    }
    for (const r of rows) {
      const tr = document.createElement('tr');
      for (const c of r) {
        const td = document.createElement('td');
        td.textContent = String(c);
        tr.appendChild(td);
      }
      table.appendChild(tr);
      this.rows.push(tr);
    }
    if (title) {
      const cap = document.createElement('div');
      cap.className = 'pt-title';
      cap.textContent = title;
      el.appendChild(cap);
    }
    el.appendChild(table);
    parent.appendChild(el);
    this.el = el;
  }

  highlight(i: number | null) {
    this.rows.forEach((r, k) => r.classList.toggle('hit', k === i));
  }

  /** Highlights a column (video poker coins). */
  column(c: number) {
    this.el.querySelectorAll('tr').forEach((tr) => tr.querySelectorAll('td,th').forEach((td, k) => td.classList.toggle('col', k === c)));
  }

  show(v: boolean) {
    this.el.classList.toggle('hidden', !v);
  }

  remove() {
    this.el.remove();
  }
}
