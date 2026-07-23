# 我们的旅行 · 私有共享网站

四个人（你们）专属的旅行网站：行程、AA 记账、清单、注意事项，**实时同步、别人看不到**。
纯前端 + Supabase，只需要在 Supabase 注册**一个**免费账号，不用 Render、不用备案。

> 已去掉照片功能（省掉图片存储，部署更轻）。

---

## 一、你看到的效果（现在就能试）

本机直接打开 `index.html` 即可（或用下方本地预览命令）。此时是「本机预览模式」：数据存在你浏览器的 localStorage，**只在本机、不会共享**。
要四人共享，按下面三步接上 Supabase 即可。

本地预览（任选其一）：
```bash
cd travel-app
python3 -m http.server 3000      # 然后浏览器开 http://localhost:3000
```

---

## 二、让四人真正共享（只需注册 1 个 Supabase 账号）

### 第 1 步：注册 Supabase，建项目
1. 打开 https://supabase.com ，用 GitHub 登录、注册免费账号。
2. 新建一个 Project（地区选离你近的，如 Singapore；密码记好）。
3. 进入项目后，左侧 **SQL Editor → New query**，把本目录的 `supabase-schema.sql` 全部粘进去，**Run**。
   这一步会建好数据表、权限、实时同步，**只需跑一次**。

### 第 2 步：关掉「邮箱验证」（让共享账号能直接登录）
项目里： **Authentication → Providers → Email** ，把 **Confirm email** 关掉（关掉后首人注册即生效，不用点验证邮件）。
> 这是私有小工具，关掉更省事；别用于公开产品。

### 第 3 步：拿到连接信息，填进 `config.js`
项目里： **Project Settings → API** ，复制两项，填到 `travel-app/config.js`：
```js
window.APP_CONFIG = {
  SUPABASE_URL:       "https://xxxx.supabase.co",        // 填 Project URL
  SUPABASE_ANON_KEY:  "eyJhbGciOi...",                  // 填 anon public key
  LOGIN_EMAIL:        "travel@example.com"               // 改成你们约定的邮箱
};
```
（放心，anon key 本就设计为可公开；真正拦人的是下面第 4 步的登录密码 + 行级权限。）

### 第 4 步：把网站放到网上（GitHub Pages，你已有账号）
1. 在 GitHub 新建一个**私有**仓库，把 `travel-app` 整个文件夹 push 上去。
2. 仓库 **Settings → Pages** ，Source 选 **Deploy from a branch** → 分支选 `main`、目录选 `/ (root)` → Save。
3. 几分钟后得到一个网址：`https://你的用户名.github.io/仓库名/`。
4. 在 Supabase 项目 **Project Settings → API → CORS / Auth** 里，把上面的 GitHub Pages 网址加进允许来源（Site URL / 额外来源都填上），否则浏览器会被跨域拦住。

---

## 三、四个人怎么用

1. 你们四人打开那个 GitHub Pages 网址。
2. **第一个人**输入你们约定的**密码**，点「进入」——会自动注册好共享账号。
3. **其余三人**用**同一个邮箱 + 同一个密码**点「进入」即可登录。
   （这个邮箱+密码就是「门钥匙」，只发给你们四个。）
4. 谁改了行程/记账/清单，另外三人**立刻自动刷新**（Supabase 实时订阅）。
5. 数据存在 Supabase 云端，**7×24 在线、关机也不丢、谁都能随时开**。

改密码：在 Supabase 后台 **Authentication → Users** 里重置那个共享账号的密码即可。

---

## 四、文件说明

| 文件 | 作用 |
|------|------|
| `index.html` | 页面结构（登录门 + 4 个标签页） |
| `app.js` | 全部逻辑：登录、增删改、实时同步、localStorage 回退 |
| `config.js` | **你唯一要改的文件**：填 Supabase 地址和 key |
| `seed-data.js` | 初始的 9 天行程 + 贴士（首次打开自动载入） |
| `styles.css` | 样式（手机友好） |
| `supabase-schema.sql` | 建表 + 权限 + 实时订阅（后台跑一次） |

> 本地预览（没填 config）时，登录门会自动隐藏，直接用本机 localStorage，方便你先看看版面。
