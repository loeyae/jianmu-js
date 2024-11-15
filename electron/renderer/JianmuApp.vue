<script setup lang="ts">
import Titlebar from 'renderer/components/Titlebar.vue'
import AppContainer from 'renderer/components/AppContainer.vue'
import { ref } from 'vue'
import { api } from 'jianmu'

const { checkHeartbeat } = api

const isOK = ref(false)
const heartbeatInterval = ref(5000)
const heartbeat = async () => {
  try {
    isOK.value = await checkHeartbeat()
    if (isOK.value && heartbeatInterval.value === 5000) {
      heartbeatInterval.value = 30000
    } else if (!isOK.value && heartbeatInterval.value === 30000) {
      heartbeatInterval.value = 5000
    }
  } catch (e) {
    console.error('Heartbeat check failed.')
  } finally {
    setTimeout(heartbeat, heartbeatInterval.value)
  }
}
heartbeat()
</script>

<template>
  <div class="jianmu-main-view">
    <Titlebar />
    <Suspense>
      <AppContainer
        v-loading="!isOK"
        :element-loading-text="isOK ? '' : '正在启动...'"
        element-loading-background="#fff"
        style="width: 100%"
      />
    </Suspense>
  </div>
</template>

<style lang="scss">
@import './global.scss';

.jianmu-main-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>
