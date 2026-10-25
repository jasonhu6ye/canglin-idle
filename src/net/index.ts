import type { OnlineApi } from './api';
import { LocalApi } from './local';
import { SupabaseApi } from './supabase';

/** Supabase 项目（东京）。publishable key 本来就是公开给网页用的，权限靠数据库规则管 */
const SUPABASE_URL = 'https://yrmqaanyonmouzlziqqd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lefytsHAwRcON9IvVnSs1w_5zfKvARq';

export const online: OnlineApi = SUPABASE_KEY ? new SupabaseApi(SUPABASE_URL, SUPABASE_KEY) : new LocalApi();
export * from './api';
