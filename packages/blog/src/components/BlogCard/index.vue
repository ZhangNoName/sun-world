<script setup lang="ts">
import { ref } from "vue";

const count = ref(0);
const content = ref("文章内容的身份健康档案回复骄傲是个好地方i爱是感动犽");
const title = ref("这是一篇文章的标题");
const publishTime = ref("2024-7-10");
const lastUpdateTime = ref("2024-7-10");
const tags = ref(["123456", "vue"]);
const category = ref("技术");
const cover = ref("");
const byteNum = ref(1024);
</script>
<template>
  <article class="z-blog-card">
    <div class="header">{{ count }}</div>
    <h1 class="title">
      <a>{{ title }}</a>
    </h1>
    <div class="body">{{ content }}</div>
    <div class="footer">{{ byteNum }}</div>
  </article>
</template>

<style scoped>
.z-blog-card {
  margin-top: 1.5rem;
  border-color: white;
  background-color: var(--blog-card-bg-color);
  color: var(--blog-card-font-color);
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: stretch;
  padding: 1.5rem;
  gap: 0.5rem;
  .header {
    /* font-size: 1.5rem; */
    height: 4rem;
    color: var(--blog-card-tag-color);
    display: flex;
    justify-content: flex-start;
    align-items: center;
  }
  .title {
    height: 3rem;
    line-height: 3rem;
    font-size: 2.8rem;
    /* font-weight: 600; */
    text-align: left;
  }
  .body {
    min-height: 10rem;
    text-align: left;
  }
  .footer {
    height: 3rem;
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: 1.5rem;
  }
}
</style>
