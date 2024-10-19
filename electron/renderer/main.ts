import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import JianmuApp from './JianmuApp.vue'
import FontAwesomeIcon from './FontAwesomeIcon'

const jianmuApp = createApp(JianmuApp)
jianmuApp.component('FontAwesomeIcon', FontAwesomeIcon)
jianmuApp.component('fa', FontAwesomeIcon)
jianmuApp.use(ElementPlus, {
  locale: zhCn,
})
jianmuApp.mount('#jianmu-app')
