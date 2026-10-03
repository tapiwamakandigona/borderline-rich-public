import type { GameState, NoticeKind } from './types';

const MAX_NOTICES = 40;

export function notify(state: GameState, text: string, kind: NoticeKind = 'info'): void {
  state.notices.push({ id: state.nextNoticeId++, t: state.t, text, kind });
  if (state.notices.length > MAX_NOTICES) state.notices.splice(0, state.notices.length - MAX_NOTICES);
}
