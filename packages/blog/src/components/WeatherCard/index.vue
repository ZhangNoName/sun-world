<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { HeFengWeatherData, CurrentLocationArea } from '@/util'

  const prop = defineProps()

  const weatherIcon = computed(() => {
    console.log(HeFengWeatherData.now.icon)
    return 'qi qi-' + HeFengWeatherData.now.icon
  })
</script>

<template>
  <div class="weather-card">
    <a class="weather" :href="HeFengWeatherData.fxLink" target="_blank">
      <i :class="weatherIcon" :title="HeFengWeatherData.now.text"></i>
    </a>
    <div class="adress">
      <span>
        {{
          CurrentLocationArea.addressComponent.country +
          ' ' +
          CurrentLocationArea.addressComponent.province
        }}
      </span>
    </div>
    <div class="card-list">
      <div class="card-item">
        <span>{{ $t('weather.temp') }}</span>
        <span>{{ HeFengWeatherData.now.temp }}</span>
      </div>
      <div class="card-item">
        <span>{{ $t('weather.feelsLike') }}</span>
        <span>{{ HeFengWeatherData.now.feelsLike }}</span>
      </div>

      <div class="card-item">
        <span>{{ HeFengWeatherData.now.windDir }}</span>
        <span>{{ HeFengWeatherData.now.windScale }}</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .weather-card {
    width: auto;
    height: auto;
    padding: 1.5rem;
    border-radius: 0.5rem;
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: 18rem 2.5rem 6rem;
    gap: 1.5rem;
    background-color: var(--blog-card-bg-color);

    .weather {
      // background-color: pink;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      & > i {
        font-size: 18rem;
      }
    }
    .adress {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
    }
    .card-list {
      // background-color: bisque;
      display: flex;
      justify-content: space-evenly;
      align-items: center;
      .card-item {
        width: 5rem;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        & > :first-child {
          font-size: 1.1rem;
        }
        & > :nth-child(2) {
          font-size: 2.8rem;
          font-weight: 400;
        }
      }
    }
  }
</style>
