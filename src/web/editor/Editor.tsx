import { useMemo, useState } from 'react';
import { loadGame } from '../../engine';
import type { Project } from '../projects';
import { BoardTab, ComponentsTab, InfoTab } from './Forms';
import { LoopEditor } from './LoopEditor';
import { asList, asMap, readDoc, type Doc } from './yamlDoc';

/** Nodes nothing leads to (other than start and common actions): usually a forgotten connection. */
function unreachable(loop: Doc, out: string[] = []): string[] {
  const nodes = asMap(loop.nodes);
  const targets = new Set(asList<string[]>(loop.edges).map((e) => e[1]));
  for (const [id, raw] of Object.entries(nodes)) {
    const n = asMap(raw);
    if (n.type !== 'start' && !n.common && !targets.has(id)) out.push(String(n.label ?? id));
    if (n.loop && typeof n.loop === 'object') unreachable(n.loop as Doc, out);
  }
  return out;
}

interface Props {
  project: Project;
  onChange: (p: Project) => void;
  onPlay: () => void;
  onExport: () => void;
  onClose: () => void;
}

const TABS = [
  { id: 'info', label: '게임 정보' },
  { id: 'components', label: '컴포넌트와 배치' },
  { id: 'board', label: '보드' },
  { id: 'loop', label: '진행 (루프)' },
  { id: 'files', label: '파일 (고급)' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function Editor({ project, onChange, onPlay, onExport, onClose }: Props) {
  const [tab, setTab] = useState<TabId>('loop');
  const files = project.files;
  const setFiles = (f: Record<string, string>) => {
    const name = /^name:\s*(.+)$/m.exec(f['game.yaml'] ?? '')?.[1]?.trim().replace(/^["']|["']$/g, '');
    onChange({ ...project, files: f, name: name || project.name });
  };

  const problem = useMemo(() => {
    try {
      loadGame(files);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [files]);
  const lonely = useMemo(() => unreachable(readDoc(files, 'loop.yaml') ?? {}), [files]);

  return (
    <div className="editor">
      <div className="editor-head">
        <div className="editor-title">
          <button className="btn btn-small" onClick={onClose}>← 내 게임 목록</button>
          <strong>{project.name}</strong>
          <span className="muted">자동 저장됨</span>
        </div>
        <div className="row">
          <button className="btn" onClick={onExport}>파일로 내보내기</button>
          <button className="btn btn-primary" onClick={onPlay} disabled={!!problem}>▶ 플레이해 보기</button>
        </div>
      </div>
      <div className={`validity ${problem ? 'is-bad' : 'is-ok'}`} role="status">
        {problem ? <><strong>고칠 곳이 있어요:</strong> <code>{problem}</code></> : '규칙에 문제가 없어요. 플레이해 볼 수 있어요.'}
      </div>
      {!problem && lonely.length > 0 && (
        <div className="validity is-warn" role="status">
          <strong>확인해 보세요:</strong> {lonely.map((l) => `'${l}'`).join(', ')}(으)로 들어오는 연결이 없어서 게임 중에 이 노드에 갈 수 없어요.
        </div>
      )}
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab${tab === t.id ? ' is-on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="tab-body">
        {tab === 'info' && <InfoTab files={files} setFiles={setFiles} />}
        {tab === 'components' && <ComponentsTab files={files} setFiles={setFiles} />}
        {tab === 'board' && <BoardTab files={files} setFiles={setFiles} />}
        {tab === 'loop' && <LoopEditor files={files} setFiles={setFiles} />}
        {tab === 'files' && <FilesTab files={files} setFiles={setFiles} />}
      </div>
    </div>
  );
}

function FilesTab({ files, setFiles }: { files: Record<string, string>; setFiles: (f: Record<string, string>) => void }) {
  const names = Object.keys(files).sort((a, b) => (a.includes('/') === b.includes('/') ? a.localeCompare(b) : a.includes('/') ? 1 : -1));
  const [open, setOpen] = useState(names[0] ?? '');
  const [newName, setNewName] = useState('');
  return (
    <div className="files-tab">
      <div className="file-list">
        {names.map((n) => (
          <button key={n} className={`file-item${n === open ? ' is-on' : ''}`} onClick={() => setOpen(n)}>{n}</button>
        ))}
        <div className="row">
          <input placeholder="새 파일 (예: lib/rules.lua)" value={newName} onChange={(e) => setNewName(e.target.value.trim())} />
          <button className="btn btn-small" disabled={!newName || !!files[newName]} onClick={() => {
            setFiles({ ...files, [newName]: newName.endsWith('.lua') ? 'return {\n}\n' : '' });
            setOpen(newName);
            setNewName('');
          }}>만들기</button>
        </div>
      </div>
      {open && files[open] !== undefined && (
        <div className="file-edit">
          <div className="row">
            <strong>{open}</strong>
            {!['game.yaml', 'board.yaml', 'loop.yaml'].includes(open) && (
              <button className="btn btn-small" onClick={() => {
                const { [open]: _, ...rest } = files;
                setFiles(rest);
                setOpen('game.yaml');
              }}>이 파일 지우기</button>
            )}
          </div>
          <textarea
            className="code"
            spellCheck={false}
            value={files[open]}
            onChange={(e) => setFiles({ ...files, [open]: e.target.value })}
            onKeyDown={(e) => {
              if (e.key !== 'Tab') return;
              e.preventDefault();
              const t = e.currentTarget;
              const s = t.selectionStart;
              const v = t.value.slice(0, s) + '  ' + t.value.slice(t.selectionEnd);
              setFiles({ ...files, [open]: v });
              requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2; });
            }}
          />
        </div>
      )}
    </div>
  );
}
