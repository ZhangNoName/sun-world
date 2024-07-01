<script setup lang="ts"></script>
<template>
  <div class="z-header">
    <div class="left-menu">
      <div class="logo"></div>
      <div class="welcom">Welcome ~~</div>
      <div class="menu-item"></div>
    </div>
    <div class="right-menu">
      <div class="link-icon">2</div>
    </div>
    <div class="user-menu">3</div>
  </div>
</template>

<style scoped lang="scss">
.z-header {
  width: 100%;
  height: 50px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 10% 4fr 3fr 50px 10%;
  grid-template-areas: "1 2 3 4 5";
  border-bottom: 2px solid rgb(180, 180, 180);
  .left-menu {
    grid-column: 2 / 3;
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: 15px;
    .logo {
      width: 50px;
      height: 50px;
      background-image: url(/public/logo.jfif);
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
    }
  }
  .right-menu {
    grid-column: 3 / 4;
    display: flex;
    justify-content: flex-end;
    align-items: center;
  }
  .user-menu {
    grid-column: 4 / 5;
    display: flex;
    justify-content: center;
    align-items: center;
  }
}
</style>
