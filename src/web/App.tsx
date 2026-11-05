import { useEffect, useRef, useState } from 'react';
import { Editor } from './editor/Editor';
import { GAMES } from './games';
import { PlayView } from './PlayView';
import {
  TEMPLATES, deleteProject, exportProject, importProject, loadProjects, newId, saveProject, type Project,
} from './projects';

type Mode = 'play' | 'make';

function gameName(files: Record<string, string>) {
  return /^name:\s*(.+)$/m.exec(files['game.yaml'] ?? '')?.[1]?.trim().replace(/^["']|["']$/g, '');
}

export function App() {
  const [mode, setMode] = useState<Mode>('play');
  const [projects, setProjects] = useState<Project[]>(loadProjects);
  const [selection, setSelection] = useState(`builtin:${GAMES.find((g) => g.id === 'chess')?.id ?? GAMES[0]?.id}`);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  // keep the play selection valid if a project disappears
  useEffect(() => {
    if (selection.startsWith('project:') && !projects.some((p) => `project:${p.id}` === selection)) {
      setSelection(`builtin:${GAMES[0]?.id}`);
    }
  }, [projects, selection]);

  const files = selection.startsWith('project:')
    ? projects.find((p) => `project:${p.id}` === selection)?.files
    : GAMES.find((g) => `builtin:${g.id}` === selection)?.files;

  const update = (p: Project) => {
    setProjects((list) => list.map((x) => (x.id === p.id ? p : x)));
    if (!saveProject(p)) setNotice('브라우저에 저장하지 못했어요. 파일로 내보내서 보관해 주세요.');
  };

  const create = (name: string, f: Record<string, string>) => {
    const p: Project = { id: newId(), name, files: f, updated: Date.now() };
    setProjects((list) => [p, ...list]);
    saveProject(p);
    setEditing(p.id);
    setMode('make');
  };

  const editingProject = projects.find((p) => p.id === editing) ?? null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>◆</span>
          <span>Tabletop Engine</span>
        </div>
        <nav className="mode-tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'play'} className={`tab${mode === 'play' ? ' is-on' : ''}`} onClick={() => setMode('play')}>플레이</button>
          <button role="tab" aria-selected={mode === 'make'} className={`tab${mode === 'make' ? ' is-on' : ''}`} onClick={() => setMode('make')}>만들기</button>
        </nav>
        {mode === 'play' && (
          <label className="game-select">
            <span>게임</span>
            <select value={selection} onChange={(e) => setSelection(e.target.value)}>
              {projects.length > 0 && (
                <optgroup label="내가 만든 게임">
                  {projects.map((p) => <option key={p.id} value={`project:${p.id}`}>{p.name}</option>)}
                </optgroup>
              )}
              <optgroup label="예제 게임">
                {GAMES.map((g) => <option key={g.id} value={`builtin:${g.id}`}>{gameName(g.files) ?? g.id}</option>)}
              </optgroup>
            </select>
          </label>
        )}
        {mode === 'play' && selection.startsWith('project:') && (
          <button className="btn" onClick={() => { setEditing(selection.slice(8)); setMode('make'); }}>이 게임 고치기</button>
        )}
      </header>

      {notice && (
        <div className="error-box" onClick={() => setNotice(null)}>
          <span>{notice}</span>
        </div>
      )}

      {mode === 'play' && files && <PlayView gameKey={selection} files={files} />}

      {mode === 'make' && editingProject && (
        <Editor
          project={editingProject}
          onChange={update}
          onPlay={() => { setSelection(`project:${editingProject.id}`); setMode('play'); }}
          onExport={() => exportProject(editingProject)}
          onClose={() => setEditing(null)}
        />
      )}

      {mode === 'make' && !editingProject && (
        <div className="projects">
          <section className="card">
            <h2>새 게임 만들기</h2>
            <p className="muted">틀을 하나 골라서 시작해요. 무엇이든 나중에 바꿀 수 있어요.</p>
            <div className="template-grid">
              {TEMPLATES.map((t) => (
                <button key={t.id} className="template" onClick={() => create(t.label, t.files())}>
                  <strong>{t.label}</strong>
                  <span className="muted">{t.help}</span>
                </button>
              ))}
            </div>
            <div className="row">
              <span className="muted">예제 게임을 복사해서 시작하기:</span>
              <select aria-label="복사할 예제" id="copy-src" defaultValue="">
                <option value="" disabled>예제 고르기</option>
                {GAMES.map((g) => <option key={g.id} value={g.id}>{gameName(g.files) ?? g.id}</option>)}
              </select>
              <button className="btn btn-small" onClick={() => {
                const id = (document.getElementById('copy-src') as HTMLSelectElement).value;
                const g = GAMES.find((x) => x.id === id);
                if (g) create(`${gameName(g.files) ?? g.id} (복사본)`, { ...g.files });
              }}>복사해서 만들기</button>
            </div>
            <div className="row">
              <button className="btn btn-small" onClick={() => importInput.current?.click()}>파일에서 가져오기</button>
              <input ref={importInput} type="file" accept=".json,application/json" hidden onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  const p = await importProject(f);
                  create(p.name, p.files);
                } catch (err) {
                  setNotice(`가져오지 못했어요: ${(err as Error).message}`);
                }
              }} />
            </div>
          </section>

          <section className="card">
            <h2>내가 만든 게임</h2>
            {projects.length === 0 && <p className="muted">아직 없어요. 위에서 새 게임을 만들어 보세요.</p>}
            <ul className="project-list">
              {projects.map((p) => (
                <li key={p.id} className="project-row">
                  <strong>{p.name}</strong>
                  <span className="muted">{new Date(p.updated).toLocaleString()}</span>
                  <div className="row">
                    <button className="btn btn-small" onClick={() => setEditing(p.id)}>고치기</button>
                    <button className="btn btn-small" onClick={() => { setSelection(`project:${p.id}`); setMode('play'); }}>플레이</button>
                    <button className="btn btn-small" onClick={() => exportProject(p)}>내보내기</button>
                    <button className="btn btn-small" onClick={() => {
                      if (!confirm(`'${p.name}'을(를) 지울까요? 되돌릴 수 없어요.`)) return;
                      deleteProject(p.id);
                      setProjects((list) => list.filter((x) => x.id !== p.id));
                    }}>지우기</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
