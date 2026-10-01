export const CHAT_DRAG_MIME = 'application/x-orchestrator-chat';
export const CHAT_REF_MIME = 'application/x-orchestrator-chat';
const PREFIX = 'chat://';

export interface ChatDragPayload {
  workspaceId: string;
  threadId: string;
  title: string;
}

export function beginChatDrag(event: React.DragEvent, payload: ChatDragPayload) {
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData(CHAT_DRAG_MIME, JSON.stringify(payload));
  event.dataTransfer.setData('text/plain', payload.title);
}

export function isChatDrag(data: DataTransfer | null): boolean {
  return Boolean(data && Array.from(data.types).includes(CHAT_DRAG_MIME));
}

export function readChatDrag(data: DataTransfer | null): ChatDragPayload | null {
  if (!data) return null;
  try {
    const raw = data.getData(CHAT_DRAG_MIME);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ChatDragPayload>;
    if (!parsed.workspaceId) return null;
    return { workspaceId: parsed.workspaceId, threadId: parsed.threadId ?? '', title: parsed.title || 'Chat' };
  } catch {
    return null;
  }
}

export function chatRefPath(payload: ChatDragPayload): string {
  return `${PREFIX}${payload.workspaceId}/${payload.threadId}?title=${encodeURIComponent(payload.title)}`;
}

export function isChatRefPath(path: string | undefined): boolean {
  return Boolean(path && path.startsWith(PREFIX));
}

export function chatRefTitle(path: string): string {
  const query = path.split('?')[1] ?? '';
  const title = new URLSearchParams(query).get('title');
  return title || 'Chat';
}
