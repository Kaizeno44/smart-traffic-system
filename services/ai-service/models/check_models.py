from ultralytics import YOLO

models = [
    "moto_best.pt",
    "helmet_lp_best.pt",
    "my_lp_model.pt",
    "yolov8n.pt"
]

for path in models:
    print("\n" + "=" * 60)
    print("MODEL:", path)

    try:
        model = YOLO(path)

        print("Task:", model.task)
        print("Classes:")

        for class_id, class_name in model.names.items():
            print(f"  {class_id}: {class_name}")

    except Exception as e:
        print("ERROR:", e)