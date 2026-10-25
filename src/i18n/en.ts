import { EN_DATA, EN_CORE } from './en-data';
import { EN_BEAST } from './en-beast';
import { EN_UI } from './en-ui';
import { EN_TEXT } from './en-text';
import { EN_ONLINE } from './en-online';
import { EN_SOCIAL } from './en-social';

// 英文语言包（用户 10-25）：按来源分文件，键是源码里的中文原文
export const EN: Record<string, string> = { ...EN_DATA, ...EN_CORE, ...EN_BEAST, ...EN_UI, ...EN_TEXT, ...EN_ONLINE, ...EN_SOCIAL };
