import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Pagination,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableProps } from "antd";
import { getAdminCustomers, type AdminCustomer } from "@/api/membership";
import { topUpCustomerWallet } from "@/api/wallet";

interface TopUpFormValues {
  paid_amount: number;
  bonus_amount: number;
  note: string;
}

const currency = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
});

export default function CustomersPage() {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedCustomer, setSelectedCustomer] =
    useState<AdminCustomer | null>(null);
  const [topUpSaving, setTopUpSaving] = useState(false);
  const [topUpForm] = Form.useForm<TopUpFormValues>();
  const paidAmount = Form.useWatch("paid_amount", topUpForm) ?? 0;
  const bonusAmount = Form.useWatch("bonus_amount", topUpForm) ?? 0;
  const topUpRequestKey = useRef("");

  function createTopUpRequestKey() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  }

  function openTopUp(customer: AdminCustomer) {
    topUpRequestKey.current = createTopUpRequestKey();
    topUpForm.setFieldsValue({
      paid_amount: 200,
      bonus_amount: 30,
      note: "线下储值",
    });
    setSelectedCustomer(customer);
  }

  async function submitTopUp() {
    const values = await topUpForm.validateFields().catch(() => null);
    if (!values || !selectedCustomer) return;

    setTopUpSaving(true);
    try {
      const result = await topUpCustomerWallet(selectedCustomer.id, {
        paid_cents: Math.round(values.paid_amount * 100),
        bonus_cents: Math.round(values.bonus_amount * 100),
        request_key: topUpRequestKey.current || createTopUpRequestKey(),
        note: values.note?.trim() ?? "",
      });
      message.success(
        `储值成功，当前余额 ${currency.format(result.balance_cents / 100)}`,
      );
      setSelectedCustomer(null);
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : "储值失败，请重试");
    } finally {
      setTopUpSaving(false);
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getAdminCustomers({ q: search, page, page_size: pageSize })
      .then((result) => {
        if (!active) return;
        setCustomers(result.customers);
        setTotal(result.total);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "用户加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search, page, pageSize, refreshKey]);

  const columns: TableProps<AdminCustomer>["columns"] = [
    {
      title: "用户",
      dataIndex: "nickname",
      render: (nickname: string) => (
        <>
          <Typography.Text strong>{nickname || "微信用户"}</Typography.Text>
        </>
      ),
    },
    {
      title: "等级",
      dataIndex: "member_level",
      width: 90,
      render: (level: number) => (
        <Tag color={level > 1 ? "gold" : "default"}>V{level}</Tag>
      ),
    },
    { title: "积分", dataIndex: "points", width: 110 },
    {
      title: "储值余额",
      dataIndex: "balance_cents",
      width: 130,
      render: (cents: number) => currency.format(cents / 100),
    },
    { title: "累计订单", dataIndex: "order_count", width: 110 },
    {
      title: "累计实付",
      dataIndex: "paid_total_cents",
      width: 140,
      render: (cents: number) => currency.format(cents / 100),
    },
    { title: "注册时间", dataIndex: "created_at", width: 175 },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 100,
      render: (_, customer) => (
        <Button type="link" onClick={() => openTopUp(customer)}>线下储值</Button>
      ),
    },
  ];

  return (
    <div className="page-stack">
      <div className="page-heading">
        <Typography.Title level={2}>用户列表</Typography.Title>
        <Button onClick={() => setRefreshKey((key) => key + 1)}>刷新</Button>
      </div>
      {error && <Alert type="error" showIcon message={error} />}
      <Card className="stat-card">
        <Input.Search
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onSearch={(value) => {
            setPage(1);
            setSearch(value.trim());
          }}
          placeholder="搜索昵称或用户 ID"
          style={{ width: 300 }}
        />
      </Card>
      <Card className="stat-card" title={`用户 · ${total}`}>
        <Table<AdminCustomer>
          rowKey="id"
          className="products-table"
          columns={columns}
          dataSource={customers}
          loading={loading}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无用户" /> }}
          scroll={{ x: 1050 }}
        />
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          pageSizeOptions={[10, 20, 50, 100]}
          showTotal={(count) => `共 ${count} 人`}
          onChange={(nextPage, nextSize) => {
            setPage(nextPage);
            setPageSize(nextSize);
          }}
          style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}
        />
      </Card>
      <Modal
        title={`为 ${selectedCustomer?.nickname || `用户 ${selectedCustomer?.id ?? ""}`} 储值`}
        open={Boolean(selectedCustomer)}
        confirmLoading={topUpSaving}
        okText="确认已收款并入账"
        cancelText="取消"
        onOk={submitTopUp}
        onCancel={() => setSelectedCustomer(null)}
        destroyOnHidden
      >
        <Alert
          type="warning"
          showIcon
          message="请先在线下确认收到顾客款项，再确认入账。赠送金额也会成为可消费余额。"
          style={{ marginBottom: 20 }}
        />
        <Form
          form={topUpForm}
          layout="vertical"
          onValuesChange={() => {
            topUpRequestKey.current = createTopUpRequestKey();
          }}
        >
          <Form.Item
            label="实收金额（元）"
            name="paid_amount"
            rules={[
              { required: true, message: "请输入实收金额" },
              {
                type: "number",
                min: 0.01,
                max: 100000,
                message: "实收金额需在 0.01 至 100,000 元之间",
              },
            ]}
          >
            <InputNumber
              min={0.01}
              max={100000}
              precision={2}
              addonAfter="元"
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item
            label="赠送余额（元）"
            name="bonus_amount"
            rules={[
              { required: true, message: "请输入赠送金额，没有赠送请填 0" },
              {
                type: "number",
                min: 0,
                max: 100000,
                message: "赠送金额不能超过 100,000 元",
              },
            ]}
          >
            <InputNumber
              min={0}
              max={100000}
              precision={2}
              addonAfter="元"
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item
            label="备注"
            name="note"
            rules={[{ max: 255, message: "备注不能超过 255 个字符" }]}
          >
            <Input maxLength={255} placeholder="例如：线下充值活动" />
          </Form.Item>
        </Form>
        <Typography.Text strong>
          本次到账 {currency.format((paidAmount + bonusAmount) || 0)}
        </Typography.Text>
      </Modal>
    </div>
  );
}
