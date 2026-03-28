<p align="center">
  <img src=".claude/skills/run/wanshoudijun.png" />
</p>

<p align="center" style="font-size: 1.6em; font-family: 'STZhongsong', 'STKaiti', 'KaiTi', '楷体', 'SimSun', serif; letter-spacing: 0.15em;">
  三花聚顶本是幻<br>脚下腾云亦非真
</p>

<p align="center">
  <strong>学习万寿帝君的管理理念，让Agent团队自我循环迭代进化。</strong>
</p>

<p align="center">
  <sub>内阁执行，司礼监校验。</sub>
</p>

<p align="center">
  <a href="#-核心设计">核心设计</a> ·
  <a href="#-快速开始">快速开始</a> ·
  <a href="#-初始团队">初始团队</a> ·
  <a href="#-技术组件">技术组件</a>
</p>

---

## 核心设计

1. **金杯共汝饮，白刃不相饶。** 严格按照测试驱动执行。所有任务都必须定义好测试过程。内阁执行，司礼监直接检查最终产出。
2. **思危、思退、思变：** 严格增加每个agent的记忆读取和反思的过程。执行前必须读取各自的记忆，完成后必须更新个字的认知。在执行过程中不断反思过去的认知。


## 快速开始

使用 Claude 进行安装，在Claude Code里输入：

```
从 Github远程仓库安装 skill：仓库地址：https://github.com/chingswy/1566 ，skill目录：`.claude/skills/run`
```



```
/run <任务描述>
```

## 初始团队

| 角色 | 做什么 |
|------|--------|
| 首辅 | 理解意图、拆分任务、调度执行 |
| 织造 | 写代码、改文件、实现功能 |
| 清流 | 检查执行过程中修改的文件或者代码，确保符合预期 |
| 掌印 | 审查最终产出，确保符合圣意 |