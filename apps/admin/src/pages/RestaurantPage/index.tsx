import { useEffect, useState } from 'react'
import { EnvironmentOutlined } from '@ant-design/icons'
import { App as AntdApp, Button, Card, Form, Input, InputNumber, Space, Spin, Switch, Typography } from 'antd'
import MapSearchPicker from '@/components/MapSearchPicker'
import type { AmapCoordinate } from '@/api/amap'
import { getRestaurantSettings, updateRestaurantSettings, type RestaurantSettings } from '@/api/restaurant'

export default function RestaurantPage() {
  const { message } = AntdApp.useApp()
  const [form] = Form.useForm<RestaurantSettings>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)

  useEffect(() => {
    getRestaurantSettings()
      .then((settings) => form.setFieldsValue(settings))
      .catch((error: unknown) => message.error(error instanceof Error ? error.message : '门店配置加载失败'))
      .finally(() => setLoading(false))
  }, [form])

  function openMapPicker() {
    setMapOpen(true)
  }

  function closeMapPicker() {
    setMapOpen(false)
  }

  function confirmMapLocation(result: { addressName: string; longitude: number; latitude: number }) {
    form.setFieldsValue({
      store_address: result.addressName,
      store_longitude: Number(result.longitude.toFixed(6)),
      store_latitude: Number(result.latitude.toFixed(6)),
    })
    setMapOpen(false)
  }

  async function save() {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const settings = await updateRestaurantSettings(values)
      form.setFieldsValue(settings)
      message.success('门店配置已保存')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const longitude = form.getFieldValue('store_longitude')
  const latitude = form.getFieldValue('store_latitude')
  const hasValidCoordinate = typeof longitude === 'number'
    && typeof latitude === 'number'
    && Number.isFinite(longitude)
    && Number.isFinite(latitude)
    && longitude >= -180 && longitude <= 180
    && latitude >= -85 && latitude <= 85
  const initialCoordinate: AmapCoordinate | undefined = hasValidCoordinate ? [longitude, latitude] : undefined

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <Typography.Title level={2}>门店与营业配置</Typography.Title>
          <Typography.Text type="secondary">配置营业时间、用餐方式和配送。</Typography.Text>
        </div>
        <Button type="primary" size="large" loading={saving} onClick={() => void save()}>保存配置</Button>
      </div>
      {/* <Alert type="info" showIcon message="当前为单门店设置；后台接口尚未接入管理员登录，正式上线前需启用后台鉴权。" /> */}
      <Card className="restaurant-settings-card">
        <Spin spinning={loading}>
          <Form form={form} layout="vertical" requiredMark={false} className="product-form">
          <Form.Item name="restaurant_name" label="门店名称" rules={[{ required: true, whitespace: true }, { max: 80 }]}>
            <Input maxLength={80} placeholder="例如：MONGA·艋舺" />
          </Form.Item>
          <Form.Item name="business_hours" label="营业时间" rules={[{ required: true, whitespace: true }, { max: 255 }]}>
            <Input maxLength={255} placeholder="例如：10:00-14:00，17:00-22:00" />
          </Form.Item>
          <Space size={22} wrap>
            <Form.Item name="is_open" label="当前接单" valuePropName="checked"><Switch checkedChildren="营业" unCheckedChildren="打烊" /></Form.Item>
            <Form.Item name="dine_in_enabled" label="堂食" valuePropName="checked"><Switch checkedChildren="开放" unCheckedChildren="关闭" /></Form.Item>
            <Form.Item name="takeaway_enabled" label="外带自取" valuePropName="checked"><Switch checkedChildren="开放" unCheckedChildren="关闭" /></Form.Item>
            <Form.Item name="delivery_enabled" label="外卖配送" valuePropName="checked"><Switch checkedChildren="开放" unCheckedChildren="关闭" /></Form.Item>
          </Space>
          <Form.Item label="门店地址">
            <Space.Compact block>
              <Form.Item name="store_address" noStyle rules={[{ max: 255 }]}>
                <Input maxLength={255} placeholder="例如：上海市静安区南京西路…" />
              </Form.Item>
              <Button icon={<EnvironmentOutlined />} disabled={loading} onClick={openMapPicker}>地图选点</Button>
            </Space.Compact>
          </Form.Item>
          <Typography.Text type="secondary">
            支持通过高德地图搜索或点击地图定位；坐标使用高德 GCJ-02，经纬度会自动回填。
          </Typography.Text>
          <Space size={16} className="form-row" align="start" wrap>
            <Form.Item
              name="store_latitude"
              label="门店纬度"
              rules={[{
                validator: async (_, value: number | null | undefined) => {
                  if (value == null) {
                    if (!form.getFieldValue('delivery_enabled')) return
                    throw new Error('启用外卖时请输入门店纬度')
                  }
                  if (!Number.isFinite(value)) throw new Error('请输入有效的门店纬度')
                  if (value < -85 || value > 85) throw new Error('高德地图支持的纬度约为 -85° 至 85°')
                },
              }]}
            >
              <InputNumber min={-85} max={85} precision={6} style={{ width: '100%' }} placeholder="例如：31.230416" />
            </Form.Item>
            <Form.Item
              name="store_longitude"
              label="门店经度"
              rules={[{
                validator: async (_, value: number | null | undefined) => {
                  if (!form.getFieldValue('delivery_enabled') || Number.isFinite(value)) return
                  throw new Error('启用外卖时请输入门店经度')
                },
              }]}
            >
              <InputNumber min={-180} max={180} precision={6} style={{ width: '100%' }} placeholder="例如：121.473701" />
            </Form.Item>
          </Space>
          <Form.Item name="contact_phone" label="联系电话" rules={[{ max: 20 }]}>
            <Input maxLength={20} placeholder="顾客联系门店的电话" />
          </Form.Item>
          <Space size={16} className="form-row" align="start" wrap>
            <Form.Item
              name="delivery_radius_km"
              label="最远配送距离（公里）"
              rules={[{ required: true }, ({ getFieldValue }) => ({
                validator: async (_, value: number) => {
                  if (value >= (getFieldValue('delivery_free_radius_km') ?? 0)) return
                  throw new Error('最远配送距离不能小于免配送费距离')
                },
              })]}
            >
              <InputNumber min={0.1} max={100} precision={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="delivery_free_radius_km" label="免配送费范围（公里）" rules={[{ required: true, type: 'number', min: 0, max: 100 }]}>
              <InputNumber min={0} max={100} precision={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="delivery_minimum_amount" label="外卖起送金额（元）" rules={[{ required: true }]}>
              <InputNumber min={0} precision={2} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="delivery_fee_per_km" label="超出后每公里（元）" rules={[{ required: true, type: 'number', min: 0, max: 1000 }]}>
              <InputNumber min={0} max={1000} precision={2} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Typography.Text type="secondary">
            超出免配送费范围后，按“每开始 1 公里”计费；超出最远配送距离时无法下单。
          </Typography.Text>
          </Form>
        </Spin>
      </Card>
      <MapSearchPicker
        open={mapOpen}
        initialAddress={String(form.getFieldValue('store_address') ?? '')}
        initialCoordinate={initialCoordinate}
        onCancel={closeMapPicker}
        onConfirm={confirmMapLocation}
      />
    </div>
  )
}
