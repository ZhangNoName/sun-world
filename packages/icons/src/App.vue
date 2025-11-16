<script setup lang="ts">
  import { reactive, ref, shallowRef } from 'vue'
  import { AddOutlined, Clock } from '@/icons'
  import ZIconCard from '@/components/IconCard.vue'
  interface IconItem {
    name: string
    component: any
  }
  const iconsList = reactive<IconItem[]>([
    {
      name: '123456',
      component: shallowRef(AddOutlined),
    },
    {
      name: 'clock',
      component: shallowRef(Clock),
    },
  ])
</script>

<template>
  <div className="z-icon-home">
    <div className="z-home-header">Header</div>
    <div className="z-home-content">
      <ZIconCard
        v-for="(Item, index) in iconsList"
        :key="index"
        :icon="Item.component"
      />
    </div>
    <div className="z-home-footer">Footer</div>
  </div>
</template>

<style scoped lang="scss">
  .z-icon-home {
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: 50px 1fr 50px;
    gap: 10px;
    font-size: 1.4rem;

    .z-home-header {
    }
    .z-home-content {
      display: grid;
      grid-template-columns: repeat(auto-fill, 200px);
      grid-auto-rows: 200px;
      gap: 10px;
      padding: 25px;
    }
  }
</style>
