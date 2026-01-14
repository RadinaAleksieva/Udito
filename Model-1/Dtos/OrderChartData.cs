using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DesignedByPo.SMSService.Database.Model.Dtos;

/// <summary>
/// Order chart data
/// </summary>
public class OrderChartData
{
    public string ProductIdentifier { get; set; }

    public string ProductName { get; set; }

    public DateTime OrderDate { get; set; }

    public decimal Amount { get; set; }

    public int Quantity { get; set; }
}
