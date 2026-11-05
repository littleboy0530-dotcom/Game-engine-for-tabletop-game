import { describe, expect, it } from 'vitest';
import { replay } from '../src/engine';
import { gameDir, readGameFolder, startGame } from './helpers';

const files = readGameFolder(gameDir('lanes'));

describe('three fronts (hidden simultaneous play, solo automa)', () => {
  it('asks the person for three lanes, the automa answers by itself, then reveals', async () => {
    const e = await startGame(files, 4);
    expect(e.error).toBeNull();
    expect(e.pending).toMatchObject({ kind: 'choose', player: 'king', prompt: '왼쪽 산길에 낼 카드를 고르세요' });
    e.input({ kind: 'choose', option: 0 });
    // the card goes face down while the next lane is chosen
    const left = e.view.contents['left@king']!;
    expect(left).toHaveLength(1);
    expect(e.view.pieces[left[0]!]!.face).toBe('down');
    expect(e.isVisible(left[0]!, 'shadow')).toBe(false);
    expect(e.pending?.kind === 'choose' && e.pending.prompt).toBe('가운데 평원에 낼 카드를 고르세요');
    e.input({ kind: 'choose', option: 0 });
    e.input({ kind: 'choose', option: 0 });
    // the automa played its three cards, the round was resolved, and round 2 asks the person again
    expect(e.state.vars.round).toBe(2);
    expect(e.pending).toMatchObject({ kind: 'choose', player: 'king' });
    expect(e.inputs).toHaveLength(6);
    const won = e.state.log.filter((l) => l.includes('승리') || l.includes('무승부'));
    expect(won).toHaveLength(3);
    const influence = Number(e.state.playerVars.king!.influence) + Number(e.state.playerVars.shadow!.influence);
    expect(influence).toBeLessThanOrEqual(4);
    // the shadow lord puts its strongest card in the middle
    expect(e.state.contents['hand@king']).toHaveLength(5);
  });

  it('plays whole solo games to a result and replays them', async () => {
    for (const seed of [1, 2, 3]) {
      const e = await startGame(files, seed);
      for (let i = 0; i < 200 && e.pending; i++) e.input({ kind: 'choose', option: i % 3 });
      expect(e.error?.message ?? null).toBeNull();
      expect(e.state.finished).toBe(true);
      const again = await replay(e.def, seed, e.inputs);
      expect(again.state).toEqual(e.state);
      // undo returns to the person's last choice, skipping the automa's
      e.undoToAction();
    }
  });

  it('works for two people when the script line is removed', async () => {
    const two = { ...files, 'game.yaml': files['game.yaml']!.replace(', script: ai/shadow.lua', '') };
    const e = await startGame(two);
    for (let i = 0; i < 3; i++) e.input({ kind: 'choose', option: 0 });
    expect(e.pending).toMatchObject({ kind: 'choose', player: 'shadow' });
  });
});
