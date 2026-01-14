namespace DesignedByPo.SMSService.Database.Model;

public class GeneratedAudits: DocumentModel
{
    public DateTime TargetDate { get; set; }

    public string FileName { get; set; } = string.Empty;

    public string FileContent { get; set; } = string.Empty;
}
