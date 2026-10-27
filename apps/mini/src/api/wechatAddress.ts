import type { AddressInput } from './addresses'

export class WechatAddressPermissionError extends Error {
  constructor() {
    super('微信通讯地址授权未开启')
    this.name = 'WechatAddressPermissionError'
  }
}

export function chooseWechatAddress() {
  return new Promise<AddressInput | null>((resolve, reject) => {
    uni.chooseAddress({
      success: (result) => {
        resolve({
          recipient_name: String(result.userName || '').trim(),
          phone: String(result.telNumber || '').trim(),
          province: String(result.provinceName || '').trim(),
          city: String(result.cityName || '').trim(),
          district: String(result.countyName || '').trim(),
          detail: String(result.detailInfoNew || result.detailInfo || result.streetName || '').trim(),
          is_default: false,
        })
      },
      fail: (error) => {
        const message = String(error?.errMsg || '')
        if (/cancel/i.test(message)) {
          resolve(null)
          return
        }
        if (/auth deny|authorize|permission/i.test(message)) {
          reject(new WechatAddressPermissionError())
          return
        }
        reject(new Error('暂时无法获取微信收货地址，请稍后重试'))
      },
    })
  })
}

export function openWechatAddressSettings() {
  uni.showModal({
    title: '需要通讯地址授权',
    content: '请在微信设置中允许使用通讯地址，也可以继续手动填写。',
    confirmText: '前往设置',
    success: ({ confirm }) => {
      if (confirm) uni.openSetting({})
    },
  })
}
