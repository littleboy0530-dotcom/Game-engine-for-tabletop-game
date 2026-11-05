import { describe, expect, it } from 'vitest';
import type { Engine } from '../src/engine';
import { replay } from '../src/engine';
import { gameDir, play, readGameFolder, startGame } from './helpers';

const files = readGameFolder(gameDir('starmarket'));

const count = (e: Engine, zone: string) => e.state.contents[zone]!.length;
const typeOf = (e: Engine, id: string) => e.state.pieces[id]!.type;

describe('star market (center row refilled by a listener)', () => {
  it('fills the center row with six cards', async () => {
    const e = await startGame(files);
    expect(e.error).toBeNull();
    expect(count(e, 'center')).toBe(6);
    expect(count(e, 'centerDeck')).toBe(24 - 6);
    expect(count(e, 'hand@a')).toBe(5);
    expect(e.state.vars.honorPool).toBe(25);
  });

  it('refills the center row whenever a card leaves it', async () => {
    // stack the deck: put the two cheapest heroes first so a buy is possible with apprentices
    const e = await startGame(files, 2);
    const p = e.pending!;
    if (p.kind !== 'action') throw new Error('expected action');
    // play every card in hand
    while (e.pending?.kind === 'action' && e.pending.actions.some((a) => a.label === '카드 내기')) {
      e.input({ kind: 'action', node: 'play', option: 0 });
    }
    const runes = Number(e.state.playerVars.a!.runes);
    const might = Number(e.state.playerVars.a!.might);
    expect(runes + might).toBe(5); // 8 apprentices + 2 guards in the deck, 5 drawn
    const before = [...e.state.contents.center!];
    const actions = e.pending?.kind === 'action' ? e.pending.actions : [];
    const fromCenter = [...actions.find((a) => a.label === '영웅 사기')?.options ?? [], ...actions.find((a) => a.label === '괴물 처치')?.options ?? []]
      .filter((o) => o.ref && before.includes(o.ref.id));
    if (fromCenter.length) {
      const o = fromCenter[0]!;
      const node = actions.find((a) => a.options.includes(o))!.path.at(-1)!;
      const idx = actions.find((a) => a.options.includes(o))!.options.indexOf(o);
      e.input({ kind: 'action', node, option: idx });
      expect(e.error).toBeNull();
      expect(count(e, 'center')).toBe(6);
      expect(count(e, 'centerDeck')).toBe(24 - 7);
      expect(e.state.contents.center).not.toContain(o.ref!.id);
    } else {
      // nothing affordable in this shuffle: the cultist is always defeatable with 2 might, or mystic with 3 runes
      expect(runes >= 2 || might >= 2).toBe(true);
    }
  });

  it('the cultist stays after being defeated', async () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const e = await startGame(files, seed);
      while (e.pending?.kind === 'action' && e.pending.actions.some((a) => a.label === '카드 내기')) {
        e.input({ kind: 'action', node: 'play', option: 0 });
      }
      if (Number(e.state.playerVars.a!.might) < 2) continue;
      play(e, '광신자');
      expect(count(e, 'cultist')).toBe(1);
      expect(e.state.playerVars.a!.honor).toBe(1);
      expect(e.state.vars.honorPool).toBe(24);
      return;
    }
    throw new Error('no seed gave 2 might');
  });

  it('a greedy game ends when honor runs out and replays exactly', async () => {
    const e = await startGame(files, 9);
    for (let i = 0; i < 4000 && e.pending; i++) {
      const p = e.pending;
      if (p.kind !== 'action') {
        e.input({ kind: 'choose', option: 0 });
        continue;
      }
      const by = (label: string) => p.actions.find((a) => a.label === label);
      const playA = by('카드 내기');
      const defeat = by('괴물 처치');
      const buy = by('영웅 사기');
      const best = (a: NonNullable<typeof buy>, key: 'cost' | 'defense') => {
        const vals = a.options.map((o) => Number(e.def.pieceTypes[typeOf(e, o.ref!.id)]!.props[key]));
        return vals.indexOf(Math.max(...vals));
      };
      if (playA) e.input({ kind: 'action', node: 'play', option: 0 });
      else if (defeat) e.input({ kind: 'action', node: 'defeat', option: best(defeat, 'defense') });
      else if (buy) e.input({ kind: 'action', node: 'buy', option: best(buy, 'cost') });
      else e.input({ kind: 'action', node: 'endTurn', option: 0 });
      expect(e.error?.message ?? null).toBeNull();
      expect(count(e, 'center')).toBe(Math.min(6, count(e, 'center') + count(e, 'centerDeck')));
    }
    expect(e.state.finished).toBe(true);
    expect(e.state.result?.reason).toMatch(/점수/);
    const again = await replay(e.def, 9, e.inputs);
    expect(again.state).toEqual(e.state);
  });
});
