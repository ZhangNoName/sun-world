<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { OpenAiLangChian } from '@/aigc/openai_langchian'
import { OPENAI_API_KEY } from '@/constant'
import { ElMessage } from 'element-plus'
import {
  AIGCSvg,
  CharacterSvg,
  DiscoverSvg,
  DragSvg,
  AddSvg,
  SettingSvg,
  Search,
  EditSvg,
  ExportSvg,
  FullScreenSvg,
  ClearSvg,
  RobotSvg,
} from '@sun-world/icons-vue'
import ZBtn from '@/components/ZBtn/index.vue'
import ChannelCard from '@/components/ChannelCard/index.vue'
import ZHeader from '@/layout/header/index.vue'
const prop = defineProps()
const sidebarClass = ref<'expend' | 'hide'>('expend')
const openAi = new OpenAiLangChian({
  apiKey: OPENAI_API_KEY,
  modelType: 'gpt-3.5-turbo',
  needParser: true,
  baseUrl: 'https://apikeyplus.com/v1',
})

const sendMsg = async (msg: string) => {
  if (!msg) {
    ElMessage.error('请输入内容')
  }
  let res = await openAi.sendMsg({
    text: msg,
  })

  console.log('返回的信息', res)
}

const changeSidebar = () => {
  if (sidebarClass.value === 'expend') {
    sidebarClass.value = 'hide'
  } else {
    sidebarClass.value = 'expend'
  }
}
onMounted(async () => {
  // sendMsg()
  // langSmith()
})
</script>

<template>
  <div class="aigc-page page-container">
    <ZHeader />
    <div class="aigc-content content" :class="sidebarClass">
      <div class="sidebar">
        <div class="header">
          <div class="title">NextChat</div>
          <div class="des">Build your own AI assistant.</div>
          <div class="logo"><AIGCSvg width="5rem" height="5rem" /></div>
        </div>
        <div class="func">
          <ZBtn fontSize="1.2rem">
            <CharacterSvg
              #icon
              color="rgb(51,51,51)"
              width="1.6rem"
              height="1.6rem"
            />
            {{ sidebarClass == 'expend' ? '面具' : null }}
          </ZBtn>
          <ZBtn fontSize="1.2rem">
            <DiscoverSvg
              #icon
              color="rgb(51,51,51)"
              width="1.6rem"
              height="1.6rem"
            />
            {{ sidebarClass == 'expend' ? '发现' : null }}
          </ZBtn>
        </div>
        <div class="body">
          <ChannelCard
            id="0"
            title="测试"
            dialogNum="100"
            createTime="2024.8.4 12:12"
          ></ChannelCard>
        </div>
        <div class="tail">
          <ZBtn>
            <SettingSvg
              #icon
              color="rgb(51,51,51)"
              width="1.6rem"
              height="1.6rem"
            />
          </ZBtn>
          <ZBtn fontSize="1.2rem">
            <AddSvg
              #icon
              color="rgb(51,51,51)"
              width="1.6rem"
              height="1.6rem"
            />
            {{ sidebarClass == 'expend' ? '新的聊天' : null }}
          </ZBtn>
        </div>
        <div class="drag" @click="changeSidebar">
          <DragSvg width="1.4rem" height="1.4rem" />
        </div>
      </div>
      <div class="content">
        <div class="header">
          <div>
            <div>测试</div>
            <div>共18条对话</div>
          </div>
          <div>
            <ZBtn>
              <Search
                #icon
                color="rgb(51,51,51)"
                width="1.6rem"
                height="1.6rem"
              />
            </ZBtn>
            <ZBtn>
              <EditSvg
                #icon
                color="rgb(51,51,51)"
                width="1.6rem"
                height="1.6rem"
              />
            </ZBtn>
            <ZBtn>
              <ExportSvg
                #icon
                color="rgb(51,51,51)"
                width="1.6rem"
                height="1.6rem"
              />
            </ZBtn>
            <ZBtn>
              <FullScreenSvg
                #icon
                color="rgb(51,51,51)"
                width="1.6rem"
                height="1.6rem"
              />
            </ZBtn>
          </div>
        </div>
        <div class="body"></div>
        <div class="input-panel">
          <div class="func">
            <ZBtn>
              <SettingSvg
                #icon
                color="rgb(51,51,51)"
                width="1.6rem"
                height="1.6rem"
              />
            </ZBtn>
            <ZBtn>
              <ClearSvg
                #icon
                color="rgb(51,51,51)"
                width="1.6rem"
                height="1.6rem"
              />
            </ZBtn>
            <ZBtn>
              <RobotSvg
                #icon
                color="rgb(51,51,51)"
                width="1.6rem"
                height="1.6rem"
              />
            </ZBtn>
          </div>
          <label for="prompt" class="prompt">
            <textarea
              placeholder="Enter 发送，Shift + Enter 换行，/ 触发补全，: 触发命令"
            ></textarea>
            <ZBtn type="primary" fontSize="1.2rem">
              <SettingSvg
                #icon
                color="rgb(51,51,51)"
                width="1.6rem"
                height="1.6rem"
              />
              发送
            </ZBtn>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@import '../constant.scss';
.aigc-page {
  .aigc-content {
    display: flex;
    // gap: 1rem;
    height: 75rem;
    margin: 10rem auto auto;
    border: 1px solid var(--border-color);
    border-radius: 2rem;
    overflow: hidden;
    box-shadow: var(--aigc-box-shadow);

    .sidebar {
      position: relative;
      gap: 1.5rem;
      background-color: var(--bg-color-0);
      padding: 2rem;
      display: flex;
      flex-direction: column;
      width: 30rem;
      box-shadow: var(--aigc-box-shadow);
      .header {
        position: relative;
        padding-top: 2rem;
        padding-bottom: 2rem;
        text-align: left;
        .title {
          font-size: 2rem;
          font-weight: 700;
          animation: all 0.3s ease;
          color: var(--font-color-0);
        }
        .des {
          font-size: 1.2rem;
          font-weight: 400;
          animation: all 0.3s ease;
          color: var(--font-color-2);
        }
        .logo {
          position: absolute;
          right: 0;
          bottom: 1.8rem;
          opacity: 0.27;
        }
      }
      .func {
        display: flex;
        justify-content: space-around;
        align-items: center;
        gap: 1rem;
        .sun-btn {
          flex-grow: 1;
        }
      }
      .body {
        flex: auto;
        overflow-y: auto;
        overflow-x: hidden;
      }
      .tail {
        padding-top: 2rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .drag {
        position: absolute;
        top: 0;
        right: 0;
        height: 100%;
        width: 1.4rem;
        background-color: transparent;
        cursor: ew-resize;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        opacity: 0;

        &:hover {
          background-color: var(--bg-color-1);
          // content: ;
          opacity: 0.5;
        }
      }
    }
    & > .content {
      flex: auto;
      display: flex;
      flex-direction: column;
      position: relative;
      height: 100%;
      min-width: 50%;
      .header {
        padding: 1.4rem 2rem;
        border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        position: relative;
        display: flex;
        justify-content: space-between;
        align-items: center;
        & > :last-child {
          display: flex;
          justify-content: space-around;
          align-items: center;
          gap: 1rem;
        }
      }
      .body {
        flex: 1 1;
        overflow: auto;
        overflow-x: hidden;
        padding: 2rem 2rem 4rem;
        position: relative;
        overscroll-behavior: none;
      }
      .input-panel {
        position: relative;
        width: 100%;
        padding: 1rem 2rem 2rem;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        border-top: 1px solid var(--border-color);
        box-shadow: var(--box-shadow);
        .func {
          display: flex;
          flex-wrap: wrap;
          gap: 1.5rem;
          .sun-btn {
            padding: 0.4rem 1rem;
          }
        }
        .prompt {
          cursor: text;
          display: flex;
          flex: 1 1;
          border-radius: 10px;
          border: 1px solid var(--border-color);
          textarea {
            height: 100%;
            width: 100%;
            border-radius: 1rem;
            border: none;
            box-shadow: 0 -2px 5px rgba(0, 0, 0, 0.03);
            background-color: var(--bg-color);
            color: var(--font-color);
            font-family: inherit;
            padding: 1rem 9rem 1rem 1.4rem;
            resize: none;
            outline: none;
            box-sizing: border-box;
            min-height: 68px;
          }
          .sun-btn {
            // background-color: var(--font-color-0);
            color: #fff;
            position: absolute;
            right: 30px;
            bottom: 32px;
            font-size: 1.2rem;
          }
        }
      }
    }
  }
  .hide {
    .sidebar {
      width: 10rem;
      .header {
        .title,
        .des {
          display: none;
        }
        .logo {
          position: relative;
          display: flex;
          justify-content: center;
          // top: 50%;
          // left: 50%;
          // transform: translate(-50%, -50%);
        }
      }
      .func {
        flex-direction: column;
      }
      .tail {
        flex-direction: column;
        gap: 1rem;
      }
    }
  }
}
</style>
