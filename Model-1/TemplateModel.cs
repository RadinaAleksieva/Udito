using MongoDB.Bson.Serialization.Attributes;
using static DesignedByPo.SMSService.Database.Enums;

namespace DesignedByPo.SMSService.Database.Model;

public class TemplateModel: DocumentModel
{
    public string Name { get; set; } = string.Empty;

    public string TemplateText { get; set; } = string.Empty;

    public EnumTamplateType TemplateType { get; set; }

    public HashSet<TemplateKeyWord> TemplateKeyWords { get; set; } = [];
}
