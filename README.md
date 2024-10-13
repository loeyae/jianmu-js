# 推包
1. build ts
```shell
npm install -g tsup typescript
npm run build
```
2. 推包
```shell
npm login --registry https://nexus.dev.loeyae.com/repository/npm-hosted/
npm publish --registry https://nexus.dev.loeyae.com/repository/npm-hosted/
```
