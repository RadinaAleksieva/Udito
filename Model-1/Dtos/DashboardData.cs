using System;

namespace DesignedByPo.SMSService.Database.Model.Dtos;

public class DashboardData
{
    public int TotalOrders { get; set; }
    public decimal TotalRevenue { get; set; }
    public int TotalCustomers { get; set; }
    public int PendingReceipts { get; set; }
    public decimal OrdersGrowthPercent { get; set; }
    public decimal RevenueGrowthPercent { get; set; }
    public decimal CustomersGrowthPercent { get; set; }
}