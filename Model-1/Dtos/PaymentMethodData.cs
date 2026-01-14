using System;

namespace DesignedByPo.SMSService.Database.Model.Dtos;


public class PaymentMethodData
{
    public string PaymentMethod { get; set; } = string.Empty;
    public int Count { get; set; }
    public decimal Percentage { get; set; }
}