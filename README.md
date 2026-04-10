# OpenList

一个支持多种存储源的目录列表程序。

## 项目结构

```
.
├── backend/          # 后端代码 (当前目录)
│   ├── server/       # 服务端代码
│   ├── internal/     # 内部包
│   ├── public/dist/  # 编译后的前端文件 (自动生成)
│   └── .github/      # GitHub Actions 配置
│
├── frontend/         # 前端源代码
│   ├── src/          # 前端源码
│   ├── dist/         # 编译后的前端 (构建时生成)
│   └── ...
│
└── ...
```

## 构建说明

### 本地构建

1. 构建前端:
```bash
cd frontend
pnpm install
pnpm run build
```

2. 将前端复制到后端:
```bash
# Windows
xcopy /E /I frontend\dist public\dist

# Linux/macOS
cp -r frontend/dist public/
```

3. 构建后端:
```bash
go build -o openlist -ldflags="-w -s" -tags=jsoniter .
```

### GitHub Actions 自动构建

推送到 `main` 分支或创建标签 `v*` 会自动触发构建。

构建平台包括:
- Windows amd64
- Linux amd64 (musl 静态编译)
- Linux arm64
- macOS amd64
- macOS arm64 (Apple Silicon)
- Android amd64
- Android arm64

## 前端修改

如需修改前端，请编辑 `frontend/` 目录下的文件，然后重新构建并推送。

## 版本说明

- 使用本地前端文件构建 (WebVersion=local)
- 版本号从 Git tag 中获取