<script setup lang="ts" name="me">
import SvgIcon from '@/baseCom/SvgIcon/svgIcon.vue'
import { ref } from 'vue'

// 模拟用户信息
const user = ref({
  name: '小明',
  bio: '热爱生活，记录美好瞬间 📷',
  avatar: '/avator.webp',
  stats: {
    follow: 128,
    fans: 230,
    likes: 560,
  },
})

// 功能菜单
const menus = [
  { name: '发布', icon: 'upload' },
  { name: '收藏', icon: 'star' },
  { name: '草稿箱', icon: 'draft' },
  { name: '设置', icon: 'setting' },
]
</script>

<template>
  <div class="me-page">
    <!-- 顶部背景与用户信息 -->
    <div class="profile-header">
      <img class="cover-bg" src="https://picsum.photos/1200/400" alt="cover" />
      <div class="profile-info">
        <img class="avatar" :src="user.avatar" alt="avatar" />
        <div class="info-text">
          <h2 class="username">{{ user.name }}</h2>
          <p class="bio">{{ user.bio }}</p>
          <div class="stats">
            <div class="stat-item">
              <span class="num">{{ user.stats.follow }}</span>
              <span class="label">关注</span>
            </div>
            <div class="stat-item">
              <span class="num">{{ user.stats.fans }}</span>
              <span class="label">粉丝</span>
            </div>
            <div class="stat-item">
              <span class="num">{{ user.stats.likes }}</span>
              <span class="label">获赞</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 菜单区 -->
    <div class="menu-list">
      <div v-for="item in menus" :key="item.name" class="menu-item">
        <SvgIcon :name="item.icon" size="20" />
        <span>{{ item.name }}</span>
      </div>
    </div>

    <!-- 内容展示区 -->
    <div class="content-section">
      <div class="card" v-for="i in 9" :key="i">
        <img :src="`https://picsum.photos/400/400?random=${i}`" alt="" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.me-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--color-text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC',
    'Microsoft YaHei', sans-serif;
}

/* 顶部背景 */
.profile-header {
  position: relative;
  width: 100%;
  height: 260px;
  overflow: hidden;
}

.cover-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 260px;
  object-fit: cover;
  filter: brightness(0.8);
}

.profile-info {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: var(--space-4);
  align-items: center;
  color: var(--btn-text-color);
  width: 90%;
  max-width: 800px;
}

.avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 2px solid var(--btn-text-color);
  object-fit: cover;
}

.info-text {
  flex: 1;
}

.username {
  font-size: var(--font-size-xl);
  font-weight: 600;
  margin: 0;
}

.bio {
  font-size: var(--font-size-md);
  opacity: 0.9;
  margin: 4px 0 10px 0;
}

.stats {
  display: flex;
  gap: var(--space-4);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.num {
  font-weight: 600;
  font-size: var(--font-size-lg);
}
.label {
  font-size: var(--font-size-sm);
}

/* 菜单区 */
.menu-list {
  display: flex;
  justify-content: space-around;
  align-items: center;
  background: var(--color-surface-card);
  border-radius: var(--radius-lg);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  margin-top: var(--space-4);
  width: 90%;
  max-width: 800px;
  padding: 10px 0;
}

.menu-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: color 0.3s;
}

.menu-item:hover {
  color: var(--text-active, #ff4d4f);
}

/* 内容区 */
.content-section {
  margin-top: 20px;
  display: grid;
  gap: 12px;
  width: 90%;
  max-width: 800px;
}

/* 移动端一列，平板两列，桌面三列 */
@media (min-width: 480px) {
  .content-section {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (min-width: 768px) {
  .content-section {
    grid-template-columns: repeat(3, 1fr);
  }
}

.card {
  background: var(--color-surface-card);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: transform 0.2s;
}

.card:hover {
  transform: translateY(-4px);
}

.card img {
  width: 100%;
  height: auto;
  display: block;
}
</style>
