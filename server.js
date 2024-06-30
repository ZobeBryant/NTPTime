const express = require("express");
const app = express();
const cors = require("cors");
// 使用 cors 中间件来启用跨域请求
app.use(cors());

// 创建一个 GET 请求处理程序，返回当前时间
app.get("/getServerTime", (req, res) => {
  const currentTime = new Date().getTime();
  res.json(currentTime);
});

// 启动服务器，监听端口
const port = 3000;
app.listen(port, () => {
  console.log(`Server is running at http://127.0.0.1:${port}/`);
});
