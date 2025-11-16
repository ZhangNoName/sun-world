<script lang="ts" setup>
import { ref } from 'vue'
import { DeleteSvg } from '../../../../icons/dist'
interface ChannelCardProps {
  title: string
  id: string | number
  createTime: string
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
      <div>
        {{
          $t('aigc.stastic', {
            num: dialogNum,
          })
        }}
      </div>
      <div>{{ createTime }}</div>
    </div>
    <div class="del">
      <DeleteSvg color="var(--text-secondary)" width="1.6rem" height="1.6rem" />
    </div>
  </div>
</template>

<style scoped>
.channel-card {
  text-align: left;
  cursor: grab;
  touch-action: manipulation;
  padding: 1rem 1.4rem;
  background-color: var(--bg-page);
  border-radius: 1rem;
  margin-bottom: 1rem;
  box-shadow: var(--box-shadow);
  transition: background-color 0.3s ease;
  -webkit-user-select: none;
  -moz-user-select: none;
  user-select: none;
  border: 0.2rem solid var(--border-default);
  position: relative;
  content-visibility: auto;

  &:hover {
    border: 0.2rem solid var(--border-lighter);
    background-color: var(--bg-hover);
    .del {
      opacity: 1;
    }
  }
  .title {
    color: var(--text-strong);
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
    color: var(--text-secondary);
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
