<script lang="ts" setup>
import { ref } from 'vue'
import { DeleteSvg } from '@sun-world/icons-vue'
interface ChannelCardProps {
  title: string
  id: string | number
  createTime: string | time
  dialogNum: string | number
}
const prop = withDefaults(defineProps<ChannelCardProps>(), {
  title: '对话1',
  id: 1,
  createTime: '2024/8/4 9:11:36',
  dialogNum: 0,
})
</script>

<template>
  <div class="channel-card">
    <div class="title">{{ title }}</div>
    <div class="info">
      <div>{{ dialogNum }}条对话</div>
      <div>{{ createTime }}</div>
    </div>
    <div class="del">
      <DeleteSvg color="var(--font-color-2)" width="1.6rem" height="1.6rem" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.channel-card {
  text-align: left;
  cursor: grab;
  touch-action: manipulation;
  padding: 1rem 1.4rem;
  background-color: var(--bg-color);
  border-radius: 1rem;
  margin-bottom: 1rem;
  box-shadow: var(--box-shadow);
  transition: background-color 0.3s ease;
  -webkit-user-select: none;
  -moz-user-select: none;
  user-select: none;
  border: 0.2rem solid var(--border-color);
  position: relative;
  content-visibility: auto;

  &:hover {
    border: 0.2rem solid var(--border-color-hover);
    background-color: var(--bg-color-hover);
    .del {
      opacity: 1;
    }
  }
  .title {
    color: var(--font-color-1);
    font-size: 1.4rem;
    font-weight: bolder;
    display: block;
    width: calc(100% - 1.5rem);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    animation: all 0.3s ease;
  }
  .info {
    display: flex;
    justify-content: space-between;
    color: var(--font-color-4);
    font-size: 12px;
    margin-top: 8px;
    animation: all 0.3s ease;
  }
  .del {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    transition: all 0.3s ease;
    opacity: 0;

    cursor: pointer;
  }
}
</style>
