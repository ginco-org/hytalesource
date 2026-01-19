import { BehaviorSubject, combineLatest, distinctUntilChanged, map } from "rxjs";
import { diffView } from "./Diff";
import { resetPermalinkAffectingSettings, supportsPermalinking } from "./Settings";

export interface State {
  version: number; // Allows us to change the permalink structure in the future
  gameVersion: string;
  file: string;
  line?: number;
  lineEnd?: number;
}

const DEFAULT_STATE: State = {
  version: 0,
  gameVersion: "local",
  file: "com/hypixel/hytale/Main.class"
};

const getInitialState = (): State => {
  const hash = window.location.hash;
  let path = hash.startsWith('#/') ? hash.slice(2) : (hash.startsWith('#') ? hash.slice(1) : '');

  // Check for line number marker (e.g., #L123 or #L10-20)
  let lineNumber: number | undefined;
  let lineEnd: number | undefined;
  const lineMatch = path.match(/(?:#|%23)L(\d+)(?:-(\d+))?$/);
  if (lineMatch) {
    lineNumber = parseInt(lineMatch[1], 10);
    if (lineMatch[2]) {
      lineEnd = parseInt(lineMatch[2], 10);
    }
    path = path.substring(0, lineMatch.index);
  }

  const segments = path.split('/').filter(s => s.length > 0);

  if (segments.length < 3) {
    return DEFAULT_STATE;
  }

  resetPermalinkAffectingSettings();

  const version = parseInt(segments[0], 10);
  let gameVersion = decodeURIComponent(segments[1]);
  const filePath = segments.slice(2).join('/');

  return {
    version,
    gameVersion,
    file: filePath + (filePath.endsWith('.class') ? '' : '.class'),
    line: lineNumber,
    lineEnd
  };
};

export const state = new BehaviorSubject<State>(getInitialState());
export const selectedFile = state.pipe(
  map(s => s.file),
  distinctUntilChanged()
);

combineLatest([state, supportsPermalinking]).subscribe(([s, supported]) => {
  if (s.version == 0) {
    return;
  }

  const className = s.file.split('/').pop()?.replace('.class', '') || s.file;
  document.title = className;

  if (!supported) {
    window.location.hash = '';
    return;
  }

  let url = `#${s.version}/${s.gameVersion}/${s.file.replace(".class", "")}`;

  if (s.line) {
    if (s.lineEnd && s.lineEnd !== s.line) {
      url += `#L${Math.min(s.line, s.lineEnd)}-${Math.max(s.line, s.lineEnd)}`;
    } else {
      url += `#L${s.line}`;
    }
  }

  if (diffView.value) {
    url = "";
  }

  window.history.replaceState({}, '', url);
});

export function setSelectedFile(file: string, line?: number, lineEnd?: number) {
  const currentState = state.value;

  // If changing to the same file and no line is specified, preserve existing line
  // This ensures permalinks with line numbers work correctly
  const isSameFile = file === currentState.file;
  const shouldPreserveLine = isSameFile && line === undefined && currentState.line !== undefined;

  state.next({
    version: 1,
    gameVersion: "local",
    file,
    line: shouldPreserveLine ? currentState.line : line,
    lineEnd: shouldPreserveLine ? currentState.lineEnd : lineEnd
  });
}