import { BlogConfig, BlogConfigType } from './config'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { DEFAULT_CONFIG } from './index.data'
export class BlogEditorClass {
  public containerEle: HTMLElement | null = null
  public config: IOptions
  public blogEditor: Vditor | null = null
  private _length: number = 0
  // private initConfig: IOptions

  constructor(ele?: HTMLElement, config?: IOptions) {
    if (ele) {
      this.init(ele)
    }
    this.config = config || DEFAULT_CONFIG
  }
  /**
   * 初始化编辑器容器，避免vue在初始化的时候ref要考虑为null
   * @param ele 编辑器容器元素
   */
  init = (ele: HTMLElement) => {
    this.containerEle = ele
    this.blogEditor = new Vditor(this.containerEle, {
      height: (ele.parentElement?.clientHeight || 500) * 0.9,
      width: '100%',
      // mode: 'sv',
      mode: 'wysiwyg',
      typewriterMode: true,
      placeholder: '在这里输入内容...',
      cache: {
        enable: false,
      },
      outline: {
        enable: true,
        position: 'right',
      },
      preview: {
        mode: 'both',
        markdown: {
          toc: true,
        },
      },
      toolbar: ['emoji', 'br', 'bold', 'outline', '|', 'line'],

      input: (value) => {
        this._length = value.length || 0
        if (this.config.input) {
          this.config.input(value)
        }
      },
    })
  }

  setConfig = (obj: IOptions) => {
    this.config = { ...this.config, ...obj }
  }

  /**
   * 获取编辑器内容，方便保存到后端
   * @returns 编辑器内容
   */
  getContent = () => {
    return this.blogEditor?.getValue() || ''
  }
  /**
   * 禁止设置编辑器内容长度
   */
  set length(v) {
    this._length = v
  }
  get length() {
    return this._length
  }

  /**
   * 保存当前编辑器信息
   */
  save = () => {}
}
