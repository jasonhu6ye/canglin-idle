import type { OnlineApi } from './api';
import { LocalApi } from './local';
import { SupabaseApi } from './supabase';
import { withBots } from './bots';

/** Supabase 项目（东京）。publishable key 本来就是公开给网页用的，权限靠数据库规则管 */
const SUPABASE_URL = 'https://yrmqaanyonmouzlziqqd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lefytsHAwRcON9IvVnSs1w_5zfKvARq';

/**
 * 人机验证（11-02，Cloudflare Turnstile，免费）：防止脚本批量注册小号。
 * 填上 site key（公开的）后登录 / 注册页会出一个验证框；Supabase 后台 Authentication → Attack Protection
 * 打开 CAPTCHA 并填 secret key。要先上线带 key 的网页再打开后台开关，不然登录不了。空 = 不用验证。
 */
export const CAPTCHA_KEY = '';

/** AI 玩家（10-31）混进在线玩家、排行榜和世界聊天，见 bots.ts */
export const online: OnlineApi = withBots(SUPABASE_KEY ? new SupabaseApi(SUPABASE_URL, SUPABASE_KEY) : new LocalApi());
export * from './api';
