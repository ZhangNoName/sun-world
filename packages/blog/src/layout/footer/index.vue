<script setup lang="ts" name="ZFooter">
import { ref } from 'vue'

const count = ref(0)
</script>

<template>
  <div class="z-footer">
    <div class="z-footer-content">
      <div class="left">
        <div class="web-name">Sun World</div>
        <span class="copyright">
          {{
            '© 版权说明：[本网站所有内容均收集于互联网或自己创作,方便于网友与自己学习交流，如有侵权，请留言，立即处理]'
          }}
        </span>
        <span>
          本站自
          <strong>2024.7.17</strong>
          已运行
          <strong>0</strong>
          天
          <strong>0</strong>
          时
          <strong>0</strong>
          分
          <strong>0</strong>
          秒
        </span>

        <div>
          <span>游览人数：&nbsp;</span>
          <strong>1</strong>
          <span>&nbsp;，游览量：</span>
          <strong>1</strong>
        </div>
      </div>
      <div class="right">
        <div class="logo"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.z-footer {
  background-color: white;
  height: 20rem;
  width: 100%;
  /* padding: 3rem 1.5rem 6rem 1.5rem; */
  padding: 3rem 0 6rem 0;
  .z-footer-content {
    margin: 0 auto;
    height: 100%;
    width: 85%;
    /* background-color: aquamarine; */
    /* border: 2px solid red; */
    display: grid;
    grid-template-columns: 70% 30%;
    grid-template-rows: auto;

    .left {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: flex-start;
      padding: 3rem 5rem;
      font-size: 1.2rem;
      span {
        text-align: left;
      }
      .web-name {
        height: 2.4rem;
        line-height: 2.1rem;
        font-size: 1.4rem;
        font-weight: 400;
      }
      .copyright {
        width: 50%;
      }
    }
    .right {
      display: flex;
      justify-content: center;
      align-items: center;
      .logo {
        height: 80%;
        aspect-ratio: 1 / 1;
        background-image: url(/logo.png);
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
      }
    }
  }
}
</style>
