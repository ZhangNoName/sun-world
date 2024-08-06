import { BlogConfig, BlogConfigType } from './config'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
export class BlogEditorClass {
  public containerEle: HTMLElement
  public config: BlogConfigType
  public blogEditor: Vditor

  constructor(ele: HTMLElement) {
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
   * 保存当前编辑器信息
   */
  save = () => {}
}
