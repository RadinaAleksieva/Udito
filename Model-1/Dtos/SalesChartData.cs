using System;

namespace DesignedByPo.SMSService.Database.Model.Dtos;

public class SalesChartData
{
    public string Month { get; set; } = string.Empty;
    public decimal Revenue { get; set; }
    public int OrderCount { get; set; }
    public DateTime Date { get; set; }
}