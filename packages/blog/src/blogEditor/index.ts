import { BlogConfig, BlogConfigType } from './config'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
export class BlogEditorClass {
  public containerEle: HTMLElement | null = null
  public config: BlogConfigType | null = null
  public blogEditor: Vditor | null = null

  constructor(ele?: HTMLElement) {
    if (ele) {
      this.init(ele)
    }
  }
  /**
   * 初始化编辑器容器，避免vue在初始化的时候ref要考虑为null
   * @param ele 编辑器容器元素
   */
  init = (ele: HTMLElement) => {
    this.containerEle = ele
    this.config = new BlogConfig()
    this.blogEditor = new Vditor(this.containerEle, {
      height: (ele.parentElement?.clientHeight || 500) * 0.9,
      mode: 'sv',
      typewriterMode: true,
      placeholder: '在这里输入内容...',
      cache: {
        enable: false,
      },
      preview: {
        mode: 'both',
      },
    })
  }

  /**
   * 获取编辑器内容，方便保存到后端
   * @returns 编辑器内容
   */
  getContent = () => {
    return this.blogEditor?.getValue()
  }
  /**
   * 保存当前编辑器信息
   */
  save = () => {}
}
