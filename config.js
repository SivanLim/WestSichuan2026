// ============================================================
//  配置：填好下面两项，网站就切换到「云端四人共享」模式。
//  留空则使用本机浏览器 localStorage（仅自己预览，不会共享）。
//
//  获取方式（注册免费 Supabase 项目后，在 Project Settings → API 里）：
//    SUPABASE_URL        →  Project URL
//    SUPABASE_ANON_KEY  →  Project API keys 里的 anon public key
// ============================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://yzslwrxwpjgjuswfjvlr.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6c2x3cnh3cGpnanVzd2ZqdmxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3OTcxNjksImV4cCI6MjEwMDM3MzE2OX0.E9K1baWYHjYkIBzSEjmW6s35jk6juJn6id5eLwHYbFY",

  // 云端模式的「共享登录邮箱」——四个人都用同一个邮箱+密码进入。
  // 改成你们约定的邮箱即可（例如 travel2026@example.com）。
  LOGIN_EMAIL: "travel2026@example.com"
};
