import { addStrings } from '../../../core/i18n';

addStrings(
  {
    'br.ante': 'ANTE',
    'br.play': 'PLAY',
    'br.bet': 'BET',
    'br.needAnte': 'Place a bet on ANTE',
    'br.step': 'Bets go in steps of {n}',
    'br.refunded': 'An unfinished round was cancelled and refunded: {n}',
    'br.resumed': 'Your unfinished round is back',
    'br.pickFirst': 'Tap a card first',
    'br.keep': 'Keep',
    'br.drawBtn': 'Draw',
    'br.stand': 'Stand',
    'br.confirm': 'Play card',
    'br.vira': 'Vira',
    'br.manilha': 'Manilhas: {r}',
    'br.pickDiscard': 'DISCARD',
    'br.pickPlay': 'PLAY',
    'br.dealerDraws': 'Dealer draws {n}',
    'br.duelWin': 'Win',
    'br.duelLoss': 'Loss',
    'br.duelDraw': 'Tie',
    'br.drawHint': 'Tap up to {n} cards to replace, then Draw (or Stand)',
    'br.duelHint': 'Choose your card for duel {n} of 3',
    'br.groups': '{n} groups · deadwood {d}',
    'br.dead': 'deadwood {d}',
    'br.cls.NO_SET': 'No set',
    'br.cls.SINGLE_SET': 'Single set',
    'br.cls.DOUBLE_SET': 'Double set',
    'br.cls.PERFECT_PIFE': 'Perfect Pife',
    'br.cls.NO_SEQUENCE': 'No sequence',
    'br.cls.SHORT_SEQUENCE': 'Short sequence',
    'br.cls.LONG_SEQUENCE': 'Long sequence',
    'br.cls.DIRTY_CANASTRA': 'Dirty Canastra',
    'br.cls.CLEAN_CANASTRA': 'Clean Canastra',
    'br.seq': '{cls} · {n} cards',
    'br.h.play': 'Strategy: PLAY',
    'br.h.fold': 'Strategy: FOLD',
    'br.h.draw': 'Strategy: replace the marked cards',
    'br.h.keep': 'Strategy: keep your cards',
    'br.h.duel': 'Strategy: play the marked card',
    'br.rules.manilhadraw': `
      <p>A 40-card Truco deck (no 8, 9, 10). One card is turned as the <b>Vira</b>: the next rank becomes the <b>manilhas</b>, stronger than any other card and ranked by suit — ♦ Pica-fumo, ♠ Espadilha, ♥ Copeta, ♣ Zap. Other cards rank 4 5 6 7 Q J K A 2 3, suits equal.</p>
      <h4>Round</h4>
      <p>Bet the Ante; you and the dealer get three cards. <b>Fold</b> (lose the Ante) or <b>Play</b> (a bet equal to the Ante). You may replace one card; the dealer replaces its weakest card when it is a 4–7 and not a manilha. Then three duels: you choose each card, the dealer plays its cards in an order fixed beforehand. More duels won wins.</p>
      <h4>Pays</h4><p>Win: Ante and Play 1:1. Same number of duels won: push.</p>`,
    'br.rules.manilhaholdem': `
      <p>Truco deck of 40 cards and a <b>Vira</b> that makes the next rank the <b>manilhas</b> (♦ < ♠ < ♥ < ♣ Zap). Two hole cards each and three board cards.</p>
      <h4>Round</h4>
      <p>Bet the Ante; after the first board card, <b>Fold</b> or <b>Play</b> (1× Ante). The other two board cards follow. Each hand is the best three cards with at least one hole card, compared card by card from the strongest — never added up.</p>
      <h4>Pays</h4><p>Win 1:1 on Ante and Play; identical strengths push. The dealer always plays.</p>`,
    'br.rules.pifeexpress': `
      <p>Six cards each from 52. Make <b>groups of three</b>: a set (same value, three suits) or a run (three in a row of one suit; A-2-3 and Q-K-A count, K-A-2 doesn't).</p>
      <h4>Round</h4>
      <p>Bet the Ante, replace up to two cards (the dealer draws by its own plan), then compare: more groups wins; with as many groups, less <b>deadwood</b> (loose cards: A 1, 2–10 face value, J Q K 10) wins. Two perfect hands push.</p>
      <h4>Pays</h4><p>Win 1:1, push returns the Ante.</p>`,
    'br.rules.videopife': `
      <p>A Pife machine: nine cards, keep at least six and replace up to three, free. Each group of three — a set or a run of one suit — counts; no card counts twice.</p>
      <h4>Paytable (total return)</h4>
      <p>Perfect Pife (3 groups) 7× · Double Set (2 groups) 2× · Single Set and No Set lose. Only the final hand is paid.</p>`,
    'br.rules.canastradraw': `
      <p>Two decks (104 cards); nine cards each and up to three replaced. Your hand is your <b>best single run</b> of one suit (A low or high, no K-A-2). A <b>2</b> can fill one missing card (wild, one per run); a 2 in its own suit at the "2" place is natural.</p>
      <h4>Classes</h4>
      <p>Clean Canastra (7+ cards, no wild) › Dirty Canastra (7+ with a wild) › Long run (5–6) › Short run (3–4) › none. Then longer run, more natural cards, higher last card; suits never decide.</p>
      <h4>Pays (only when you beat the dealer)</h4><p>Clean Canastra 3:1 · Dirty Canastra 2:1 · runs 1:1 · ties push.</p>`,
  },
  {
    'br.needAnte': 'Aposte no ANTE',
    'br.step': 'Apostas de {n} em {n}',
    'br.refunded': 'Uma rodada inacabada foi cancelada e devolvida: {n}',
    'br.resumed': 'Sua rodada inacabada voltou',
    'br.pickFirst': 'Toque numa carta primeiro',
    'br.keep': 'Manter',
    'br.drawBtn': 'Trocar',
    'br.stand': 'Manter',
    'br.confirm': 'Jogar carta',
    'br.manilha': 'Manilhas: {r}',
    'br.pickDiscard': 'TROCAR',
    'br.pickPlay': 'JOGAR',
    'br.dealerDraws': 'Dealer troca {n}',
    'br.duelWin': 'Vitória',
    'br.duelLoss': 'Derrota',
    'br.duelDraw': 'Empate',
    'br.drawHint': 'Toque em até {n} cartas para trocar e em Trocar (ou Manter)',
    'br.duelHint': 'Escolha sua carta para o duelo {n} de 3',
    'br.groups': '{n} grupos · sobra {d}',
    'br.dead': 'sobra {d}',
    'br.cls.NO_SET': 'Sem jogo',
    'br.cls.SINGLE_SET': 'Um jogo',
    'br.cls.DOUBLE_SET': 'Dois jogos',
    'br.cls.PERFECT_PIFE': 'Pife perfeito',
    'br.cls.NO_SEQUENCE': 'Sem sequência',
    'br.cls.SHORT_SEQUENCE': 'Sequência curta',
    'br.cls.LONG_SEQUENCE': 'Sequência longa',
    'br.cls.DIRTY_CANASTRA': 'Canastra suja',
    'br.cls.CLEAN_CANASTRA': 'Canastra limpa',
    'br.seq': '{cls} · {n} cartas',
    'br.h.play': 'Estratégia: JOGAR',
    'br.h.fold': 'Estratégia: DESISTIR',
    'br.h.draw': 'Estratégia: troque as cartas marcadas',
    'br.h.keep': 'Estratégia: mantenha suas cartas',
    'br.h.duel': 'Estratégia: jogue a carta marcada',
    'br.rules.manilhadraw': `
      <p>Baralho de Truco com 40 cartas (sem 8, 9 e 10). Uma carta é virada como <b>Vira</b>: o valor seguinte vira <b>manilha</b>, mais forte que qualquer outra carta e ordenada pelo naipe — ♦ Pica-fumo, ♠ Espadilha, ♥ Copeta, ♣ Zap. As demais seguem 4 5 6 7 Q J K A 2 3, naipes iguais.</p>
      <h4>Rodada</h4>
      <p>Aposte o Ante; você e o dealer recebem três cartas. <b>Desista</b> (perde o Ante) ou <b>Jogue</b> (aposta igual ao Ante). Você pode trocar uma carta; o dealer troca a mais fraca quando for 4 a 7 e não for manilha. Depois, três duelos: você escolhe cada carta e o dealer joga numa ordem definida antes. Quem vencer mais duelos ganha.</p>
      <h4>Pagamentos</h4><p>Vitória: Ante e Play 1:1. Mesmo número de duelos vencidos: empate.</p>`,
    'br.rules.manilhaholdem': `
      <p>Baralho de Truco com 40 cartas e uma <b>Vira</b> que torna o valor seguinte <b>manilha</b> (♦ < ♠ < ♥ < ♣ Zap). Duas cartas fechadas para cada um e três na mesa.</p>
      <h4>Rodada</h4>
      <p>Aposte o Ante; depois da primeira carta da mesa, <b>Desista</b> ou <b>Jogue</b> (1× Ante). Saem as outras duas cartas. Cada mão é a melhor combinação de três cartas com pelo menos uma carta fechada, comparada carta a carta da mais forte — nunca somada.</p>
      <h4>Pagamentos</h4><p>Vitória 1:1 no Ante e no Play; forças idênticas empatam. O dealer sempre joga.</p>`,
    'br.rules.pifeexpress': `
      <p>Seis cartas para cada um, de 52. Forme <b>jogos de três</b>: trinca (mesmo valor, três naipes) ou sequência (três seguidas do mesmo naipe; A-2-3 e Q-K-A valem, K-A-2 não).</p>
      <h4>Rodada</h4>
      <p>Aposte o Ante, troque até duas cartas (o dealer troca pelo seu próprio plano) e compare: mais jogos vence; com o mesmo número, vence a menor <b>sobra</b> (cartas soltas: A 1, 2–10 valor de face, J Q K 10). Dois pifes perfeitos empatam.</p>
      <h4>Pagamentos</h4><p>Vitória 1:1; empate devolve o Ante.</p>`,
    'br.rules.videopife': `
      <p>Máquina de Pife: nove cartas, mantenha pelo menos seis e troque até três, de graça. Cada jogo de três — trinca ou sequência do mesmo naipe — conta; nenhuma carta conta duas vezes.</p>
      <h4>Tabela (retorno total)</h4>
      <p>Pife perfeito (3 jogos) 7× · Dois jogos 2× · Um jogo ou nenhum perde. Só a mão final é paga.</p>`,
    'br.rules.canastradraw': `
      <p>Dois baralhos (104 cartas); nove cartas para cada um e até três trocas. Sua mão é a sua <b>melhor sequência</b> de um naipe (Ás baixo ou alto, sem K-A-2). Um <b>2</b> pode cobrir uma carta que falta (curinga, um por sequência); um 2 do próprio naipe na posição do "2" é natural.</p>
      <h4>Classes</h4>
      <p>Canastra limpa (7+ cartas, sem curinga) › Canastra suja (7+ com curinga) › Sequência longa (5–6) › Sequência curta (3–4) › nenhuma. Depois: sequência maior, mais cartas naturais, carta final mais alta; naipe nunca decide.</p>
      <h4>Pagamentos (só quando você vence o dealer)</h4><p>Canastra limpa 3:1 · Canastra suja 2:1 · sequências 1:1 · empate devolve.</p>`,
  },
);
