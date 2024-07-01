<script setup lang="ts" name="z-layout-content">
interface Props {
  title?: string;
  subTitle: string;
  icon: string;
  iconColor: string;
  iconSize: string;
  iconBgColor: string;
}
const props: Props = defineProps({
  title: { type: String },
  subTitle: { type: String, default: "副标题" },
  icon: { type: String, default: "icon-z-content" },
  iconColor: { type: String, default: "#fff" },
  iconSize: { type: String, default: "24px" },
  iconBgColor: { type: String, default: "#fff" },
});
</script>
<template>
  <div class="z-content">{{ props }}</div>
</template>

<style scoped lang="scss">
.z-content {
  background-color: var(--main-content-bg-color);
  width: 80%;
  margin: 0 auto;
}
</style>
