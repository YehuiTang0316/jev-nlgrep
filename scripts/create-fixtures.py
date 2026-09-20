from pathlib import Path
import json
root=Path(__file__).resolve().parent.parent
rows=[]
def case(category, n, query, positive, negative1, negative2, ext, scenario, no_match=False):
    ident=f'{category}-{n:02}'
    paths=[]
    # Fixed synthetic inputs only. No project source or credentials enter live evaluation.
    for name,text in zip('abc',[positive,negative1,negative2]):
        path=Path('eval/corpus')/ident/f'{name}.{ext}'
        (root/path).parent.mkdir(parents=True,exist_ok=True)
        (root/path).write_text(text+'\n')
        paths.append(path.as_posix())
    rows.append(dict(id=ident,category=category,language='zh' if n%2 else 'en',
        split='development' if n in [1,4,5,8,9] else 'holdout',scenario=scenario,query=query,
        paths=paths,expected=[] if no_match else [paths[0]],expectedLines={} if no_match else {paths[0]:[1,len(positive.splitlines())]}))
case('code',1,'包含字面字符串 ECONNRESET，区分大小写',
     'throw new Error("ECONNRESET");','throw new Error("econnreset");','throw new Error("connection reset");','ts','Q01')
case('code',2,'Code that calls fetch with method POST, excluding comments and documentation',
     'await fetch(url, { method: "POST", body: payload });','// Example: fetch(url, { method: "POST" })\nawait fetch(url);','await fetch(url, { method: "GET" });','ts','Q04')
case('code',3,'在循环里面逐个 await 网络请求的代码',
     'for (const url of urls) {\n  await fetch(url);\n}','await Promise.all(urls.map(url => fetch(url)));','for (const item of items) {\n  await delay(10);\n}','ts','Q05')
case('code',4,'Code that passes an HTTP request parameter to a shell command',
     'app.get("/run", (req, res) => {\n  const command = req.query.command;\n  exec(command);\n});','app.get("/run", (req, res) => {\n  exec("echo hello");\n});','app.get("/run", (req, res) => {\n  const command = req.query.command;\n  res.json({ command });\n});','ts','Q08')
case('code',5,'把变量直接拼接进 SQL 查询然后执行的代码',
     'const sql = "SELECT * FROM users WHERE name = " + name;\ndb.query(sql);','db.query("SELECT * FROM users WHERE name = ?", [name]);','const sql = "SELECT * FROM users WHERE name = " + name;\nconsole.log(sql);','ts','Q06')
case('code',6,'A call to JSON.parse outside a try/catch block',
     'const result = JSON.parse(input);','try {\n  const result = JSON.parse(input);\n} catch {\n  return null;\n}','const result = JSON.stringify(input);','ts','Q05')
case('code',7,'网络请求失败后采用指数退避重试的代码',
     'for (let attempt = 0; attempt < 4; attempt++) {\n  try { return await fetch(url); }\n  catch { await delay(100 * 2 ** attempt); }\n}','for (let attempt = 0; attempt < 4; attempt++) {\n  try { return await fetch(url); }\n  catch { await delay(100); }\n}','try { await fetch(url); } catch (error) { console.error(error); }','ts','Q03')
case('code',8,'A database password hardcoded as a string literal',
     'const config = { databasePassword: "synthetic-example-password" };','const config = { databasePassword: process.env.DB_PASSWORD };','console.log("Please enter a database password");','ts','Q04')
case('code',9,'实际读取 Windows 注册表的代码，不包括注释',
     'const sum = a + b;','const response = await fetch(url);','// TODO: read the Windows registry someday\nconst enabled = false;','ts','Q04',True)
case('code',10,'Actual code that streams a webcam using WebRTC, excluding comments',
     'const text = await readFile(path, "utf8");','const response = await fetch("https://example.com");','// WebRTC webcam streaming is planned.\nexport const ready = false;','ts','Q04',True)
case('docs',1,'说明如何通过环境变量配置生产数据库连接的文档',
     '# Production database\nSet DATABASE_URL in the deployment environment to the production connection string.','Database credentials are entered in the interactive development wizard.','Production logging uses the LOG_LEVEL environment variable.','md','Q03')
case('docs',2,'Instructions for rotating an API key without downtime',
     '# API key rotation\nCreate a second key, deploy clients using it, verify traffic, then revoke the old key. Both keys work during the transition.','Revoke your only API key immediately. All requests will fail until a new key is deployed.','API keys identify clients. This page documents their character format only.','md','Q03')
case('docs',3,'明确说日志保留三十天后删除的文档',
     'Application logs are retained for 30 days and then deleted automatically.','Application logs are retained for 90 days before automatic deletion.','Application logs are retained indefinitely.','md','Q02')
case('docs',4,'Documentation that allows a refund only before an order ships',
     'Refund requests are accepted before shipment. Once the order ships, it is no longer eligible for a refund.','Refund requests are accepted for 30 days after delivery.','Orders may be cancelled before shipment, but all purchases are non-refundable.','md','Q02')
case('docs',5,'同时说明支持单点登录和多因素认证的文档',
     '# Account security\nWe support single sign-on (SSO) and multi-factor authentication (MFA).','We support single sign-on (SSO). Multi-factor authentication (MFA) is not available.','We support multi-factor authentication (MFA). Single sign-on (SSO) is not available.','md','Q02')
case('docs',6,'Instructions for recovering a deleted database from backups',
     '# Recovery\nSelect a backup snapshot and restore it into a new database instance. Validate the recovered records before switching traffic.','To create a backup, select Export. This page does not describe recovery.','To recover a forgotten password, use the password reset form.','md','Q03')
case('docs',7,'整行是以 ORD- 开头后面恰好六个数字的订单号',
     'ORD-123456','ORD-12345','prefix ORD-123456 suffix','md','Q09')
case('docs',8,'Documentation saying the client retries rate-limited requests and obeys Retry-After',
     'On HTTP 429, the client waits for Retry-After and retries the request.','On HTTP 429, the client raises an error without retrying.','The client retries network disconnects. HTTP 429 is never retried.','md','Q02')
case('docs',9,'说明如何配置卫星地面站天线的文档',
     '# Database setup\nConfigure DATABASE_URL before starting.','# API authentication\nSend your API key in the Authorization header.','# Logs\nUse LOG_LEVEL to select verbosity.','md','Q03',True)
case('docs',10,'Documentation that explains how to enroll a fingerprint on a biometric lock',
     '# Account login\nUse an email address and password.','# Access keys\nGenerate an API key in settings.','# Password reset\nOpen the reset link in your inbox.','md','Q03',True)
case('logs',1,'同一条日志同时包含订单超时和重试，并且不是健康检查',
     '2026-09-20 order=123 request timed out; retry scheduled; endpoint=/checkout','2026-09-20 health check timed out; retry scheduled; endpoint=/health','2026-09-20 order=123 request timed out; retries disabled','log','Q02')
case('logs',2,'An ERROR log about a failed payment, excluding health checks',
     'ERROR payment processing failed for order 123','INFO payment processing completed for order 123','ERROR health check for the payment service failed','log','Q02')
case('logs',3,'包含字面字符串 ECONNRESET，区分大小写',
     'ERROR socket ECONNRESET while reading response','ERROR socket econnreset while reading response','ERROR connection reset while reading response','log','Q01')
case('logs',4,'A request that succeeded after a retry, not one still scheduled to retry',
     'request=abc attempt=2 status=200 message="succeeded after retry"','request=abc attempt=1 status=503 message="retry scheduled"','request=abc attempt=3 status=503 message="all retries exhausted"','log','Q03')
case('logs',5,'同一条记录包含订单超时和重试，排除健康检查',
     'order=77 timeout; retry started','order=77 timeout; no retry allowed','order=77 timeout\ncache refresh retry started','log','Q02')
case('logs',6,'A log line that starts with ERROR and ends with a three-digit HTTP status code',
     'ERROR upstream request failed 503','INFO upstream request failed 503','ERROR upstream request failed 503 retrying','log','Q09')
case('logs',7,'由于磁盘空间不足导致写入失败的日志',
     'ERROR write failed: ENOSPC, no space left on device','ERROR write failed: permission denied','INFO disk usage is 40 percent; write succeeded','log','Q03')
case('logs',8,'A failed database login due to invalid credentials rather than a network timeout',
     'ERROR database authentication failed: invalid username or password','ERROR database connection failed: network timeout','INFO database authentication succeeded','log','Q02')
case('logs',9,'记录了航天器发动机点火失败的日志',
     'ERROR database connection failed','INFO server listening on port 8080','WARN cache entry expired','log','Q03',True)
case('logs',10,'A log reporting that a GPU overheated and shut down',
     'ERROR payment request timed out','INFO worker shutdown requested by administrator','WARN CPU usage reached 85 percent','log','Q03',True)
case('text',1,'允许用户在发货之前取消订单的规定',
     'Customers may cancel their orders at any time before dispatch.','Customers cannot cancel an order once payment is received.','Customers may change their shipping address but cannot cancel an order.','txt','Q03')
case('text',2,'An entire line containing only a six-digit verification code',
     '123456','12345','Your code is 123456','txt','Q09')
case('text',3,'包含退款条件但明确排除数字商品的说明',
     'Physical products may be refunded within 14 days. Digital goods are excluded from refunds.','All products, including digital goods, may be refunded within 14 days.','Digital goods are eligible for refunds. Physical products are not.','txt','Q02')
case('text',4,'An explicit request to postpone a meeting until next week',
     'Could we move our meeting to next week? I am unavailable this week.','Let us keep the meeting at the original time this week.','I will send next week\'s meeting notes tomorrow.','txt','Q03')
case('text',5,'同一行同时包含 Alice 和 Bob，名字区分大小写',
     'Alice and Bob attended the meeting.','Alice attended.\nBob sent notes later.','alice and bob attended the meeting.','txt','Q02')
case('text',6,'A document stating that both administrators and editors can publish articles',
     'Administrators and editors are both allowed to publish articles.','Only administrators can publish articles. Editors cannot publish.','Editors can draft articles. Only administrators can publish them.','txt','Q02')
case('text',7,'以 support@ 开头并以 .com 结尾的邮箱地址',
     'support@example.com','sales@example.com','support@example.org','txt','Q09')
case('text',8,'A sentence saying a subscription renews automatically unless cancelled',
     'Your subscription renews automatically each month unless you cancel it.','Your subscription expires each month and must be renewed manually.','Your subscription never expires and has no renewal payments.','txt','Q03')
case('text',9,'描述鲸鱼迁徙路线的文字',
     'The shipment arrives on Tuesday.','The software update is ready.','Our office is closed on holidays.','txt','Q03',True)
case('text',10,'Instructions for tuning the strings of a violin',
     'Restart the application after installing updates.','Place the shipping label on the box.','Write the meeting agenda before Friday.','txt','Q03',True)
# Include multiple relevant files in each split before any live evaluation.
for ident, text in [('text-08', 'Unless you cancel, your plan is automatically extended for another month.'),
                    ('docs-06', '# Restore a deleted database\nChoose yesterday\'s snapshot, restore it, and verify the tables before resuming service.')]:
    row=next(r for r in rows if r['id']==ident)
    path=row['paths'][2]
    (root/path).write_text(text+'\n')
    row['expected'].append(path)
    row['expectedLines'][path]=[1,len(text.splitlines())]
(root/'eval/cases.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
print(f'Created {len(rows)} cases and {len(rows)*3} synthetic files.')
extra=root/'eval/corpus/supplemental'
extra.mkdir(exist_ok=True)
lines=[f'INFO heartbeat sequence={i:03}' for i in range(96)]
lines[76]='ERROR order=77 request timed out; retry scheduled; endpoint=/checkout'
(extra/'batch.log').write_text('\n'.join(lines)+'\n')
for name,check in [('a.ts','  const version = 1;'),('b.ts','  if (!req.user) throw new Error("Login required");')]:
    lines=['function handler(req) {',check]+['  void 0;']*80+['  return readUserProfile(req.query.userId);','}']
    (extra/name).write_text('\n'.join(lines)+'\n')
(extra/'latency.txt').write_text('Your subscription renews automatically each month unless you cancel it.\n')
