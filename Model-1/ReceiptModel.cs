using MongoDB.Bson.Serialization.Attributes;
using System.Globalization;
using static DesignedByPo.SMSService.Common.Enums;

namespace DesignedByPo.SMSService.Database.Model;

public class ReceiptModel
{
    [BsonId]
    public string ReceiptKey { get; set; }

    public DateTime CreatedOn { get; set; } = DateTime.Now;

    public string CreatedOnFormatted => CreatedOn.ToString("yyyy-MMM-dd HH:mm", new CultureInfo("bg-BG"));

    public string OrderNumber { get; set; }

    public string ReceiptNumber { get; set; }

    public string RecipientName { get; set; }

    public string RecipientContact { get; set; }

    public SequenceChannelType DocumentType { get; set; }

    public byte[] PdfContent { get; set; }
}
