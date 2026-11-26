import { parseCard, type Card } from '../core/cards';
import { t as tr } from '../core/i18n';
import type { GameInfo } from '../games/types';
import { cardDataURL } from '../table/cardFaces';
import { emblemDataURL } from './emblem';
import { ICONS } from './icons';

/** Lobby art codes: normal codes ("As"), "jk" = joker, "n7" = numbered trump-21 card. */
export function artCard(code: string): Card {
  if (code === 'jk') return 52;
  if (code[0] === 'n') return 100 + Number(code.slice(1));
  return parseCard(code);
}

/** Game selection screen: house name and a scrolling list with one table per row. */
export class Lobby {
  readonly el: HTMLElement;

  constructor(frame: HTMLElement, games: GameInfo[], onPick: (id: string) => void, onSoon: (g: GameInfo) => void) {
    const el = document.createElement('section');
    el.id = 'lobby';
    el.className = 'hidden';
    el.innerHTML = `
      <div class="logo">
        <div class="brandrow"><img class="emblem" alt="" src="${emblemDataURL(160)}"><div class="name gold-text">VILLA LAGO</div></div>
        <div class="sub">CASINO</div>
        <div class="rule"></div>
      </div>
      <div class="gamelist"></div>
      <div class="lobby-foot">${tr('lobby.foot')}</div>`;
    const list = el.querySelector('.gamelist')!;
    const art = new Map<string, string>();
    const url = (code: string) => {
      if (!art.has(code)) art.set(code, cardDataURL(artCard(code), 96));
      return art.get(code)!;
    };
    for (const g of games) {
      const row = document.createElement('button');
      row.className = `gamerow live${g.ready ? '' : ' soon'}`;
      row.style.setProperty('--f1', g.felt[0]);
      row.style.setProperty('--f2', g.felt[1]);
      row.dataset.game = g.id;
      const cards = g.art.map((c, i) => {
        const k = i - (g.art.length - 1) / 2;
        return `<img alt="" src="${url(c)}" style="transform: translateX(${k * 34}%) rotate(${k * 10}deg) translateY(${Math.abs(k) * 4}%)">`;
      });
      row.innerHTML = `
        <span class="gr-art">${cards.join('')}</span>
        <span class="gr-text"><b>${g.title.toUpperCase()}</b><small>${tr(g.tagline)}</small></span>
        <span class="gr-go">${ICONS.play}</span>`;
      row.onclick = () => (g.ready ? onPick(g.id) : onSoon(g));
      list.appendChild(row);
    }
    frame.appendChild(el);
    this.el = el;
  }

  show(v: boolean) {
    this.el.classList.toggle('hidden', !v);
  }
}
