<script lang="ts">
export default {
  onLaunch() {
    console.info('MONGA·艋舺 mini app launched')
  },
}
</script>

<style>
@import './app.css';
</style>

<style lang="scss">
@use '@wot-ui/ui/styles/theme/index.scss' as *;

page {
  min-height: 100%;
  background: #faf6f7;
  color: #30252a;
  --brand-primary: #c21850;
  --brand-primary-active: #9b123f;
  --brand-wine: #761329;
  --brand-soft: #fceaf0;
  --wot-primary-1: #fff4f7;
  --wot-primary-2: #ffe7ef;
  --wot-primary-3: #fbd3e0;
  --wot-primary-4: #f2aec4;
  --wot-primary-5: #e786a5;
  --wot-primary-6: #c21850;
  --wot-primary-7: #a81746;
  --wot-primary-8: #8b163d;
  --wot-primary-9: #761329;
  --wot-primary-10: #5f0f23;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
}
</style>
