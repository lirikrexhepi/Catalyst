const FALLBACK = '/file-icons/file.svg';

const EXT_ICONS: Record<string, string> = {
  ts: 'typescript.svg',
  tsx: 'react_ts.svg',
  js: 'javascript.svg',
  jsx: 'react.svg',
  mjs: 'javascript.svg',
  cjs: 'javascript.svg',
  mts: 'typescript.svg',
  cts: 'typescript.svg',
  html: 'html.svg',
  htm: 'html.svg',
  xml: 'xml.svg',
  svg: 'svg.svg',
  vue: 'vue.svg',
  svelte: 'svelte.svg',
  astro: 'astro.svg',
  css: 'css.svg',
  scss: 'sass.svg',
  sass: 'sass.svg',
  less: 'less.svg',
  json: 'json.svg',
  jsonc: 'json.svg',
  yaml: 'yaml.svg',
  yml: 'yaml.svg',
  toml: 'toml.svg',
  md: 'markdown.svg',
  mdx: 'mdx.svg',
  txt: 'document.svg',
  log: 'log.svg',
  png: 'image.svg',
  jpg: 'image.svg',
  jpeg: 'image.svg',
  gif: 'image.svg',
  webp: 'image.svg',
  ico: 'image.svg',
  bmp: 'image.svg',
  mp4: 'video.svg',
  webm: 'video.svg',
  mov: 'video.svg',
  mp3: 'audio.svg',
  wav: 'audio.svg',
  pdf: 'pdf.svg',
  sh: 'console.svg',
  bash: 'console.svg',
  zsh: 'console.svg',
  ps1: 'powershell.svg',
  bat: 'console.svg',
  cmd: 'console.svg',
  csv: 'table.svg',
  tsv: 'table.svg',
  xls: 'table.svg',
  xlsx: 'table.svg',
  zip: 'zip.svg',
  tar: 'zip.svg',
  gz: 'zip.svg',
  rar: 'zip.svg',
  py: 'python.svg',
  rb: 'ruby.svg',
  java: 'java.svg',
  go: 'go.svg',
  rs: 'rust.svg',
  c: 'c.svg',
  h: 'h.svg',
  cpp: 'cpp.svg',
  cs: 'csharp.svg',
  swift: 'swift.svg',
  kt: 'kotlin.svg',
  php: 'php.svg',
  sql: 'database.svg',
  graphql: 'graphql.svg',
};

const BASENAME_ICONS: Record<string, string> = {
  dockerfile: 'docker.svg',
  makefile: 'makefile.svg',
  jenkinsfile: 'jenkins.svg',
};

export function fileIconForPath(path: string): string {
  const base = (path.split(/[\\/]/).pop() || '').split(':')[0].split('?')[0];
  const lower = base.toLowerCase();
  if (BASENAME_ICONS[lower]) return `/file-icons/${BASENAME_ICONS[lower]}`;
  const dot = lower.lastIndexOf('.');
  if (dot <= 0 || dot === lower.length - 1) return FALLBACK;
  const file = EXT_ICONS[lower.slice(dot + 1)];
  return file ? `/file-icons/${file}` : FALLBACK;
}
