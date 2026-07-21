/**
 * 一条统一的聊天记忆节奏：最近 12 轮原文始终可见；每 4 轮先整理
 * 当前窗口中最早的一批。整理不会删除这些原文，只会同步更新摘要与长期卡片。
 */
export const CHAT_RAW_TURN_LIMIT = 12;
export const CHAT_COMPACTION_BATCH_SIZE = 4;
