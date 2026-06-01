export interface WaterfallItem {
  /**
   * 笔记的唯一标识符
   */
  id: string

  /**
   * 内容类型：'normal'（普通图文笔记）或 'video'（视频笔记）
   */
  type: 'normal' | 'video'

  /**
   * 笔记的显示标题
   */
  title: string

  /**
   * 作者的昵称
   */
  author: string

  /**
   * 点赞数
   */
  likes: number

  /**
   * 封面图片的URL
   */
  cover_url: string

  /**
   * 封面图片的原始宽度 (像素)
   */
  width: number

  /**
   * 封面图片的原始高度 (像素)
   */
  height: number

  /**
   * 封面图片的宽高比 (width / height)。
   * 这是实现瀑布流布局时，预估卡片高度的关键字段。
   */
  aspect_ratio: number
}
export const TestList: WaterfallItem[] = [
  {
    id: '68e6eb6a000000000700ec78',
    type: 'normal',
    title:
      '明天晚上到开封家人们建议穿什么[派对R]天气预报显示一直有雨准不准呀开封 万岁山',
    author: '这里是黑仔',
    likes: 3,
    cover_url:
      'http://sns-webpic-qc.xhscdn.com/202510091411/c45aedee747745e7645cff03451e4910/1040g2sg31nd6d745kse049n1kfuu210esv2lup8!nc_n_webp_prv_1',
    width: 1200,
    height: 1600,
    aspect_ratio: 0.75,
  },
  {
    id: '68e61440000000000401128a',
    type: 'normal',
    title: '播客简直就是计算机人的宝藏',
    author: '芝士小熊',
    likes: 311,
    cover_url:
      'http://sns-webpic-qc.xhscdn.com/202510091411/f7473e2c5e3f99c26830eb6a9807abb3/notes_pre_post/1040g3k831ncc575ulic05ptit7hmrta1sji2rs0!nc_n_webp_prv_1',
    width: 1080,
    height: 1440,
    aspect_ratio: 0.75,
  },
  {
    id: '68e67413000000000401564d',
    type: 'normal',
    title: '找对象，女，97年，身高165cm,来自商丘，本科毕业，目前在郑州工作。',
    author: '晓芳',
    likes: 17,
    cover_url:
      'http://sns-webpic-qc.xhscdn.com/202510091411/34bbda3b9a1e5cd1c79ce3c5e5cb20d0/1040g2sg31ncnsujk6gkg5pdubia2fm86ehe0pr0!nc_n_webp_prv_1',
    width: 1200,
    height: 1600,
    aspect_ratio: 0.75,
  },
  {
    id: '68d67c28000000001301abbd',
    type: 'normal',
    title: '昆仑万维前端一面（社招）',
    author: '庄周梦蝶',
    likes: 4,
    cover_url:
      'http://sns-webpic-qc.xhscdn.com/202510091411/8a8960319fdfd25400a598e41e39b5ae/spectrum/1040g0k031mt4coeo52005n6l9drkjhp52ttgptg!nc_n_webp_prv_1',
    width: 442,
    height: 584,
    aspect_ratio: 0.756,
  },
  {
    id: '68e7507b0000000005031ffe',
    type: 'normal',
    title:
      '坐标郑州，180,70kg ，未婚，父母体制内，有退休金，年薪税后100w，两家',
    author: '郑州琪琪红娘',
    likes: 0,
    cover_url:
      'http://sns-webpic-qc.xhscdn.com/202510091411/c0350c9749229c5bc977ab3d44d47833/1040g2sg31ndi0h8m6ghg5petq9q19dpijeleeeg!nc_n_webp_prv_1',
    width: 1200,
    height: 1600,
    aspect_ratio: 0.75,
  },
  {
    id: '68e730b90000000004014f13',
    type: 'normal',
    title: '被爸妈逼的没招了 ',
    author: 'Okkkpp',
    likes: 2,
    cover_url:
      'http://sns-webpic-qc.xhscdn.com/202510091411/3836cd8f54b83e5917f3968f8ffa1254/1040g2sg31ndeshj5mg7g5or76v0nrnugsu6q8to!nc_n_webp_prv_1',
    width: 1200,
    height: 1600,
    aspect_ratio: 0.75,
  },
  {
    id: '68d90fd800000000120145dd',
    type: 'video',
    title: '活久了都会有一种si感，淡淡的',
    author: 'SameSam的尾巴',
    likes: 765,
    cover_url:
      'http://sns-webpic-qc.xhscdn.com/202510091411/043540cdb3c2dd41c3b678acdccd98d6/1040g2sg31mvla7a0ku3g5pbl2vpo6ntj3ag3mt0!nc_n_webp_prv_1',
    width: 1080,
    height: 1920,
    aspect_ratio: 0.5625,
  },
  {
    id: '68e5da790000000007035dea',
    type: 'video',
    title: '谁的罩罩掉了？ ',
    author: '叶非远',
    likes: 223,
    cover_url:
      'http://sns-webpic-qc.xhscdn.com/202510091411/16029053754f7d20398c64ec9fddb359/1040g2sg31nc52ml8kqkg5nm013108jdp3p5sbtg!nc_n_webp_prv_1',
    width: 1921,
    height: 2560,
    aspect_ratio: 0.75,
  },
  {
    id: '68e75056000000000300dace',
    type: 'normal',
    title: '朝阳二次元护士给爸妈找个女婿（照片版）',
    author: '淋湿的水蜜桃',
    likes: 2,
    cover_url:
      'http://sns-webpic-qc.xhscdn.com/202510091411/700f3703fb13a83c1750ea9da88113a2/notes_pre_post/1040g3k831ndip1rqmm705q727mqtt5ak8c3t1r0!nc_n_webp_prv_1',
    width: 1242,
    height: 1263,
    aspect_ratio: 0.983,
  },
  {
    id: '68e20304000000000700e798',
    type: 'normal',
    title: '能不能帮我问问你的程',
    author: '湖南小彬哥',
    likes: 10,
    cover_url:
      'http://sns-webpic-qc.xhscdn.com/202510091411/87dec3c890dea7ae0f37857e77be208c/notes_pre_post/1040g3k831n8d0fh3l0c05pdj8tj4tel9r8mmkto!nc_n_webp_prv_1',
    width: 1080,
    height: 2403,
    aspect_ratio: 0.45,
  },
  {
    id: '68e3daf80000000003038f96',
    type: 'normal',
    title: '98年北漂女生｜9月账单分享🧾',
    author: '小小小小糯米',
    likes: 43,
    cover_url:
      'http://sns-webpic-qc.xhscdn.com/202510091411/2acbba17e17a2e3fcf1b594b4573e3dc/spectrum/1040g34o31na6j0sm4q105p9kijpgrhl7ios3g3o!nc_n_webp_prv_1',
    width: 1105,
    height: 1097,
    aspect_ratio: 1.007,
  },
  {
    id: '68e7503f00000000030374b8',
    type: 'video',
    title: '北京真的没有秋天🍃',
    author: 'Zooey的小日子',
    likes: 0,
    cover_url:
      'http://sns-webpic-qc.xhscdn.com/202510091411/cb7defdefd7a0b8c7e36225f28499c32/1040g00831ndinaa5li004016so509f0ve6ispao!nc_n_webp_prv_1',
    width: 1080,
    height: 1920,
    aspect_ratio: 0.5625,
  },
  {
    id: '68e718ae00000000040144a8',
    type: 'normal',
    title:
      '本人女，河南人， 身高163，体重125， 长相一般。性格内向，熟了就偶尔发疯，',
    author: '哈哈哈嗝',
    likes: 8,
    cover_url:
      'http://sns-webpic-qc.xhscdn.com/202510091411/6d97f1f1b12bbf4ae45d183441865292/1040g2sg31ndbtk4e5ik05pqefqj21abicio50i8!nc_n_webp_prv_1',
    width: 1200,
    height: 1600,
    aspect_ratio: 0.75,
  },
  {
    id: '68e630b00000000007034a64',
    type: 'video',
    title: '住酒店的时候一定要小心再小心！',
    author: '汉堡汪汪汪汪',
    likes: 13,
    cover_url:
      'http://sns-webpic-qc.xhscdn.com/202510091411/8a9e65e82068c222cb7056c4d7015437/1040g2sg31ncflmghksj05q6bfv8omq5132j2f58!nc_n_webp_prv_1',
    width: 720,
    height: 1280,
    aspect_ratio: 0.5625,
  },
  {
    id: '68db73df000000000503227c',
    type: 'video',
    title: '还记得第一次见到你我心是怎样波动💓',
    author: '洱洱littleprince',
    likes: 1000,
    cover_url:
      'http://sns-webpic-qc.xhscdn.com/202510091411/18d75a2215f2fd1ded25aca4a7ecefbf/1040g00831n1vs1nglm7g5nob1v708ivaufdko40!nc_n_webp_prv_1',
    width: 2316,
    height: 3088,
    aspect_ratio: 0.75,
  },
  {
    id: '68d52df7000000001302a047',
    type: 'normal',
    title: '面试一家公司boss直聘标的20~25k，问我预期我说21k左右。最后三面结束h',
    author: 'AAAIII',
    likes: 115,
    cover_url:
      'http://sns-webpic-qc.xhscdn.com/202510091411/e8ad7a0a833ef17a82c7427482b67bd2/1040g00831mrs3aatlm605ni50vag9ce460ds2eo!nc_n_webp_prv_1',
    width: 1200,
    height: 1600,
    aspect_ratio: 0.75,
  },
  {
    id: '68daabb9000000000e00eb2d',
    type: 'video',
    title: '优衣库U系列全线购入！分享我的TOP6单品',
    author: 'GENJI玄治',
    likes: 539,
    cover_url:
      'http://sns-webpic-qc.xhscdn.com/202510091411/f850911c6afb22f5dcf27ae7cff5148b/spectrum/1040g0k031n17dvqc50005p9kepthggqvcpj1ctg!nc_n_webp_prv_1',
    width: 1011,
    height: 1348,
    aspect_ratio: 0.75,
  },
  {
    id: '68e609970000000005030fed',
    type: 'video',
    title: '地下党比塞，，，尴了个大尬。。。',
    author: '嘉倍芋泥',
    likes: 173,
    cover_url:
      'http://sns-webpic-qc.xhscdn.com/202510091411/763effb18f30d857f145da5c8f6101d8/1040g00831ncapjql503g5nk5611g8cbr12dbjho!nc_n_webp_prv_1',
    width: 1080,
    height: 1920,
    aspect_ratio: 0.5625,
  },
  {
    id: '68d9396400000000130101d3',
    type: 'normal',
    title:
      '找对象 01 170 110斤 长相有个9分吧，工作没啥男性朋友，家里想着一个人',
    author: '祁灼',
    likes: 159,
    cover_url:
      'http://sns-webpic-qc.xhscdn.com/202510091411/527363ee58ed3fc5beadd46f27ceee9c/notes_pre_post/1040g3k031mvq5u465m005ppm3qc7dt49jrn2a1o!nc_n_webp_prv_1',
    width: 1170,
    height: 1482,
    aspect_ratio: 0.789,
  },
  {
    id: '68e5dc1f00000000040139f8',
    type: 'video',
    title: 'flex布局 ',
    author: '码码评测',
    likes: 83,
    cover_url:
      'http://sns-webpic-qc.xhscdn.com/202510091411/61248ce2f31ecf1b44f5f744f2c237e0/spectrum/1040g34o31nc5bers4u0g4a1kqhd9tq0mo93ln6o!nc_n_webp_prv_1',
    width: 1011,
    height: 1348,
    aspect_ratio: 0.75,
  },
]
